using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Markdig;
using Markdig.Extensions.EmphasisExtras;
using Markdig.Extensions.TaskLists;
using Markdig.Extensions.Tables;
using Markdig.Helpers;
using Markdig.Parsers;
using Markdig.Renderers;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;

namespace HCMUSSupportV2.Backend.Modules.Notifications.Markdown;

/// <summary>One problem found in a notification body. <see cref="Line"/> and <see cref="Column"/> are 1-based (0 when unknown).</summary>
public sealed record MarkdownIssue(string Code, string Message, int Line, int Column);

/// <summary>Result of <see cref="NotificationMarkdown.Analyze"/>.</summary>
/// <param name="Issues">Contract violations; the body must not be saved when this is not empty.</param>
/// <param name="Placeholders">Distinct <c>:var[Key]</c> keys in order of first use.</param>
/// <param name="ContentText">Plain text of the body (placeholders appear as their key).</param>
/// <param name="Summary">First paragraph as one line, at most <see cref="NotificationMarkdown.SummaryMaxLength"/> characters.</param>
public sealed record MarkdownAnalysis(
    IReadOnlyList<MarkdownIssue> Issues,
    IReadOnlyList<string> Placeholders,
    string ContentText,
    string Summary)
{
    public bool IsValid => Issues.Count == 0;
}

public static class IssueCodes
{
    public const string RawHtml = "raw_html";
    public const string ImageUrl = "image_url";
    public const string LinkUrl = "link_url";
    public const string UnsupportedDirective = "unsupported_directive";
    public const string VarKeyInvalid = "var_key_invalid";
    public const string VarUndeclared = "var_undeclared";
    public const string ControlCharacter = "control_character";
}

/// <summary>
/// Validates and analyses notification Markdown (docs/notification-markdown.md): GFM subset, no raw HTML, images only
/// from <c>/api/files/{uuid}</c>, safe link schemes, and the single <c>:var[Key]</c> text directive for placeholders.
/// </summary>
public static partial class NotificationMarkdown
{
    public const int SummaryMaxLength = 300;

    /// <summary>First character is a letter (a leading underscore would turn the key into emphasis); 1-64 characters.</summary>
    [GeneratedRegex("^[A-Za-z][A-Za-z0-9_]{0,63}$")]
    public static partial Regex VarKeyPattern();

    [GeneratedRegex("^/api/files/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")]
    private static partial Regex ImageUrlPattern();

    [GeneratedRegex(@"^([A-Za-z][A-Za-z0-9+.\-]*):")]
    private static partial Regex SchemePattern();

    private static readonly HashSet<string> LinkSchemes = new(StringComparer.OrdinalIgnoreCase) { "http", "https", "mailto", "tel" };

    private static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .UsePipeTables()
        .UseEmphasisExtras(EmphasisExtraOptions.Strikethrough)
        .UseAutoLinks()
        .UseTaskLists()
        .Use<DirectiveExtension>()
        .Build();

    public static bool IsValidVarKey(string? key) => key is not null && VarKeyPattern().IsMatch(key);

    /// <summary>Link target rule shared with the frontend: http, https, mailto, tel, a root-relative path or a #fragment.</summary>
    public static bool IsSafeLinkUrl(string? url)
    {
        if (string.IsNullOrEmpty(url) || url.Any(c => char.IsWhiteSpace(c) || char.IsControl(c))) return false;
        var scheme = SchemePattern().Match(url);
        if (scheme.Success) return LinkSchemes.Contains(scheme.Groups[1].Value);
        if (url.StartsWith("//", StringComparison.Ordinal)) return false;
        return url[0] == '/' || url[0] == '#';
    }

    public static bool IsAllowedImageUrl(string? url) => url is not null && ImageUrlPattern().IsMatch(url);

    /// <param name="markdown">The body.</param>
    /// <param name="declaredKeys">Keys declared in the notification's <c>variables</c>; null skips the declared check.</param>
    public static MarkdownAnalysis Analyze(string? markdown, IReadOnlyCollection<string>? declaredKeys = null)
    {
        markdown ??= "";
        var issues = new List<MarkdownIssue>();

        if (markdown.Any(c => c == '\0' || (char.IsControl(c) && c != '\n' && c != '\r' && c != '\t')))
            issues.Add(new MarkdownIssue(IssueCodes.ControlCharacter, "Nội dung chứa ký tự điều khiển không hợp lệ.", 0, 0));

        var doc = Markdig.Markdown.Parse(markdown, Pipeline);
        var placeholders = new List<string>();
        var declared = declaredKeys is null ? null : new HashSet<string>(declaredKeys, StringComparer.Ordinal);

        foreach (var node in doc.Descendants())
        {
            var (line, col) = (node.Line + 1, node.Column + 1);
            switch (node)
            {
                case HtmlBlock:
                case HtmlInline:
                    issues.Add(new MarkdownIssue(IssueCodes.RawHtml, "Không cho phép mã HTML trong nội dung.", line, col));
                    break;
                case LinkInline { IsImage: true } image:
                    if (!IsAllowedImageUrl(image.Url))
                        issues.Add(new MarkdownIssue(IssueCodes.ImageUrl, "Ảnh chỉ được lấy từ /api/files/{mã}.", line, col));
                    break;
                case LinkInline link:
                    if (!IsSafeLinkUrl(link.Url))
                        issues.Add(new MarkdownIssue(IssueCodes.LinkUrl, "Liên kết không hợp lệ (chỉ http, https, mailto, tel hoặc đường dẫn nội bộ).", line, col));
                    break;
                case AutolinkInline auto:
                    if (!IsSafeLinkUrl(auto.IsEmail ? "mailto:" + auto.Url : auto.Url))
                        issues.Add(new MarkdownIssue(IssueCodes.LinkUrl, "Liên kết không hợp lệ.", line, col));
                    break;
                case LinkReferenceDefinition def:
                    if (!IsSafeLinkUrl(def.Url) && !IsAllowedImageUrl(def.Url))
                        issues.Add(new MarkdownIssue(IssueCodes.LinkUrl, "Liên kết không hợp lệ.", line, col));
                    break;
                case VarInline v:
                    if (!IsValidVarKey(v.Key))
                        issues.Add(new MarkdownIssue(IssueCodes.VarKeyInvalid,
                            $"Tên biến \"{v.Key}\" không hợp lệ (chữ cái đầu, chỉ gồm A-Z, a-z, 0-9, _; tối đa 64 ký tự).", line, col));
                    else
                    {
                        if (!placeholders.Contains(v.Key)) placeholders.Add(v.Key);
                        if (declared is not null && !declared.Contains(v.Key))
                            issues.Add(new MarkdownIssue(IssueCodes.VarUndeclared, $"Biến \"{v.Key}\" chưa được khai báo.", line, col));
                    }
                    break;
                case UnsupportedDirectiveInline u:
                    issues.Add(new MarkdownIssue(IssueCodes.UnsupportedDirective,
                        $"Không hỗ trợ cú pháp \"{u.Raw}\"; chỉ có :var[Tên] (viết \\: để hiển thị dấu hai chấm).", line, col));
                    break;
            }
        }

        var text = ExtractText(doc);
        return new MarkdownAnalysis(issues, placeholders, text, ExtractSummary(doc, text));
    }

    // ---- plain text ----

    private static string ExtractText(MarkdownDocument doc)
    {
        var sb = new StringBuilder();
        AppendBlock(doc, sb);
        var lines = sb.ToString().Split('\n')
            .Select(l => WhitespaceRun().Replace(l, " ").Trim())
            .Where(l => l.Length > 0);
        return string.Join('\n', lines);
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRun();

    private static void AppendBlock(Block block, StringBuilder sb)
    {
        switch (block)
        {
            case TableRow row:
                foreach (var cell in row)
                {
                    var cellText = new StringBuilder();
                    AppendBlock(cell, cellText);
                    sb.Append(WhitespaceRun().Replace(cellText.ToString(), " ").Trim()).Append(' ');
                }
                sb.Append('\n');
                break;
            case ContainerBlock container:
                foreach (var child in container) AppendBlock(child, sb);
                break;
            case LeafBlock leaf:
                if (leaf.Inline is not null) AppendInlines(leaf.Inline, sb);
                else if (leaf.Lines.Count > 0) sb.Append(leaf.Lines.ToString());
                sb.Append('\n');
                break;
        }
    }

    private static void AppendInlines(ContainerInline container, StringBuilder sb)
    {
        foreach (var inline in container)
        {
            switch (inline)
            {
                case LiteralInline lit: sb.Append(lit.Content.ToString()); break;
                case CodeInline code: sb.Append(code.Content); break;
                case LineBreakInline: sb.Append(' '); break;
                case HtmlEntityInline entity: sb.Append(entity.Transcoded.ToString()); break;
                case VarInline v: sb.Append(v.Key); break;
                case UnsupportedDirectiveInline u: sb.Append(u.Raw); break;
                case AutolinkInline auto: sb.Append(auto.Url); break;
                case TaskList: break;
                case HtmlInline: break;
                case ContainerInline nested: AppendInlines(nested, sb); break;
            }
        }
    }

    private static string ExtractSummary(MarkdownDocument doc, string contentText)
    {
        string? first = null;
        foreach (var block in doc)
        {
            if (block is not ParagraphBlock p) continue;
            var sb = new StringBuilder();
            if (p.Inline is not null) AppendInlines(p.Inline, sb);
            var t = WhitespaceRun().Replace(sb.ToString(), " ").Trim();
            if (t.Length == 0) continue;
            first = t;
            break;
        }
        first ??= contentText.Split('\n').FirstOrDefault(l => l.Length > 0) ?? "";
        return Truncate(first, SummaryMaxLength);
    }

    /// <summary>Cuts at a word boundary when possible and appends an ellipsis; never splits a surrogate pair or a combining sequence.</summary>
    public static string Truncate(string text, int max)
    {
        if (text.Length <= max) return text;
        var limit = max - 1; // room for the ellipsis
        var cut = text.LastIndexOf(' ', limit - 1, limit);
        if (cut < max / 2) cut = limit;
        // Do not cut inside a text element (surrogate pair, base + combining marks).
        var idx = StringInfo.ParseCombiningCharacters(text);
        var boundary = 0;
        foreach (var i in idx) { if (i <= cut) boundary = i; else break; }
        cut = boundary;
        return text[..cut].TrimEnd() + "…";
    }

    // ---- :var[Key] directive ----

    /// <summary>A valid-looking <c>:var[Key]</c>; the key is checked against the key pattern by the analyser.</summary>
    public sealed class VarInline : LeafInline
    {
        public string Key { get; init; } = "";
    }

    /// <summary>Any other directive syntax (<c>:b</c>, <c>:var[x]{a=1}</c>, <c>::leaf</c>, <c>:::container</c>); always rejected.</summary>
    public sealed class UnsupportedDirectiveInline : LeafInline
    {
        public string Raw { get; init; } = "";
    }

    private sealed class DirectiveExtension : IMarkdownExtension
    {
        public void Setup(MarkdownPipelineBuilder pipeline)
        {
            if (!pipeline.InlineParsers.Contains<DirectiveInlineParser>())
                pipeline.InlineParsers.Insert(0, new DirectiveInlineParser());
        }

        public void Setup(MarkdownPipeline pipeline, IMarkdownRenderer renderer) { }
    }

    /// <summary>
    /// Recognises directives the way remark-directive (micromark) does on the client: a colon that is not preceded by a
    /// colon, followed by a name that starts with an ASCII letter. <c>10:30</c> and <c>http://x</c> are not directives.
    /// </summary>
    private sealed class DirectiveInlineParser : InlineParser
    {
        public DirectiveInlineParser() => OpeningCharacters = [':'];

        public override bool Match(InlineProcessor processor, ref StringSlice slice)
        {
            if (slice.PeekCharExtra(-1) == ':') return false;

            var start = slice.Start;
            var pos = start;
            var colons = 0;
            while (pos <= slice.End && slice.Text[pos] == ':') { colons++; pos++; }
            if (pos > slice.End || !IsAsciiLetter(slice.Text[pos])) return false;

            if (colons >= 2)
            {
                // Leaf (::) and container (:::) directives only exist at the start of a line.
                var prev = slice.PeekCharExtra(-1);
                if (prev != '\0' && prev != '\n' && prev != '\r') return false;
                return Emit(processor, ref slice, start, pos + NameLength(slice, pos));
            }

            var nameEnd = pos + NameLength(slice, pos);
            var last = slice.Text[nameEnd - 1];
            if (last == '-' || last == '_') return false;

            var end = nameEnd; // exclusive
            string? label = null;
            if (end <= slice.End && slice.Text[end] == '[')
            {
                var close = FindLabelEnd(slice, end);
                if (close > 0)
                {
                    label = slice.Text.Substring(end + 1, close - end - 1);
                    end = close + 1;
                }
            }
            var hasAttributes = false;
            if (end <= slice.End && slice.Text[end] == '{')
            {
                var close = slice.Text.IndexOf('}', end, slice.End - end + 1);
                if (close > 0) { hasAttributes = true; end = close + 1; }
            }

            var name = slice.Text.Substring(pos, nameEnd - pos);
            if (name == "var" && label is not null && !hasAttributes)
            {
                Position(processor, slice, start, out var line, out var column);
                processor.Inline = new VarInline { Key = label, Line = line, Column = column };
                slice.Start = end;
                return true;
            }
            return Emit(processor, ref slice, start, end);
        }

        private static bool Emit(InlineProcessor processor, ref StringSlice slice, int start, int end)
        {
            Position(processor, slice, start, out var line, out var column);
            processor.Inline = new UnsupportedDirectiveInline { Raw = slice.Text.Substring(start, end - start), Line = line, Column = column };
            slice.Start = end;
            return true;
        }

        private static void Position(InlineProcessor processor, StringSlice slice, int at, out int line, out int column)
        {
            processor.GetSourcePosition(at, out line, out column);
        }

        private static int NameLength(StringSlice slice, int from)
        {
            var i = from;
            while (i <= slice.End && (IsAsciiLetter(slice.Text[i]) || (slice.Text[i] is >= '0' and <= '9') || slice.Text[i] == '-' || slice.Text[i] == '_')) i++;
            return i - from;
        }

        /// <summary>Index of the closing bracket of a label starting at <paramref name="open"/>, or -1. Brackets nest; backslash escapes; no line breaks.</summary>
        private static int FindLabelEnd(StringSlice slice, int open)
        {
            var depth = 0;
            for (var i = open; i <= slice.End; i++)
            {
                var c = slice.Text[i];
                if (c == '\\') { i++; continue; }
                if (c == '\n' || c == '\r') return -1;
                if (c == '[') depth++;
                else if (c == ']' && --depth == 0) return i;
            }
            return -1;
        }

        private static bool IsAsciiLetter(char c) => c is (>= 'a' and <= 'z') or (>= 'A' and <= 'Z');
    }
}
