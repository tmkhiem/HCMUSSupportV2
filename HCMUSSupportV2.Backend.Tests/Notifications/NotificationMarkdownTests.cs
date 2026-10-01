using HCMUSSupportV2.Backend.Modules.Notifications.Markdown;

namespace HCMUSSupportV2.Backend.Tests.Notifications;

/// <summary>
/// The 54 server-validator vectors of docs/notification-markdown.md (section 8), plus extra cases for the server's
/// own rules (declared placeholders, control characters, summary, key pattern).
/// </summary>
public class NotificationMarkdownTests
{
    private const string FileUrl = "/api/files/0197a3c2-5b1e-7c4a-8d2f-3e9b6a1c4d5e";
    private static readonly string Key64 = new('a', 64);

    private static string[] Codes(MarkdownAnalysis a) => a.Issues.Select(i => i.Code).Distinct().ToArray();

    /// <summary>(number, markdown, expected error code or null, placeholders, content_text)</summary>
    public static IEnumerable<object?[]> Vectors()
    {
        object?[] Ok(int n, string md, string[] placeholders, string text) => [n, md, null, placeholders, text];
        object?[] Bad(int n, string md, string code) => [n, md, code, Array.Empty<string>(), null];
        string[] None = [];

        yield return Ok(1, "Hệ số lương mới: :var[HeSoLuong]", ["HeSoLuong"], "Hệ số lương mới:");
        yield return Ok(2, ":var[A]", ["A"], "");
        yield return Ok(3, ":var[A]:var[B] và :var[A]", ["A", "B"], "và");
        yield return Ok(4, "**:var[HeSoLuong]**", ["HeSoLuong"], "");
        yield return Ok(5, "a:var[A]b", ["A"], "ab");
        yield return Ok(6, ":var[Ten_Day_Du] :var[a1] :var[x]", ["Ten_Day_Du", "a1", "x"], "");
        yield return Ok(7, $":var[{Key64}]", [Key64], "");
        yield return Bad(8, $":var[{Key64}a]", IssueCodes.UnknownDirective);
        yield return Bad(9, ":var[]", IssueCodes.UnknownDirective);
        yield return Bad(10, ":var[bad key]", IssueCodes.UnknownDirective);
        yield return Bad(11, ":var[1Key]", IssueCodes.UnknownDirective);
        yield return Bad(12, ":var[_a_]", IssueCodes.UnknownDirective);
        yield return Bad(13, ":var[**Key**]", IssueCodes.UnknownDirective);
        yield return Bad(14, ":var[Key]{a=1}", IssueCodes.UnknownDirective);
        yield return Bad(15, "::var[Key]", IssueCodes.UnknownDirective);
        yield return Bad(16, ":::note\nx\n:::", IssueCodes.UnknownDirective);
        yield return Bad(17, ":note[abc]{x=1}", IssueCodes.UnknownDirective);
        yield return Ok(18, "\\:var[A]", None, ":var[A]");
        yield return Ok(19, "`:var[A]`", None, ":var[A]");
        yield return Ok(20, "Họp lúc 10:30 sáng", None, "Họp lúc 10:30 sáng");
        yield return Ok(21, "a:b và Ghi chú:abc", None, "a:b và Ghi chú:abc");
        yield return Ok(22, "Liên hệ mailto:a@b.vn", None, "Liên hệ mailto:a@b.vn");
        yield return Ok(23, "Dòng 1\\\nDòng 2", None, "Dòng 1 Dòng 2");
        yield return Ok(24, "a < b và 5<6 và a > b", None, "a < b và 5<6 và a > b");
        yield return Ok(25, "cho {biến} và }{", None, "cho {biến} và }{");
        yield return Bad(26, "Có thẻ <b>đậm</b>", IssueCodes.RawHtml);
        yield return Bad(27, "<script>alert(1)</script>", IssueCodes.RawHtml);
        yield return Bad(28, "<!-- ghi chú -->", IssueCodes.RawHtml);
        yield return Bad(29, "x<br>y", IssueCodes.RawHtml);
        yield return Bad(30, "<u>gạch chân</u>", IssueCodes.RawHtml);
        yield return Ok(31, "<https://example.test/x>", None, "https://example.test/x");
        yield return Ok(32, "[Trang](https://example.test/x \"t\")", None, "Trang");
        yield return Ok(33, "[a](mailto:a@b.vn) [b](tel:+84123) [c](/tin-tuc/1) [d](#top)", None, "a b c d");
        yield return Bad(34, "[a](javascript:alert(1))", IssueCodes.ForbiddenUrl);
        yield return Bad(35, "[a](JaVaScRiPt:alert(1))", IssueCodes.ForbiddenUrl);
        yield return Bad(36, "[a](data:text/html;base64,AAAA)", IssueCodes.ForbiddenUrl);
        yield return Bad(37, "[a](//evil.test)", IssueCodes.ForbiddenUrl);
        yield return Bad(38, "[a](relative/path)", IssueCodes.ForbiddenUrl);
        yield return Ok(39, $"![ảnh]({FileUrl})", None, "ảnh");
        yield return Bad(40, "![x](https://tracker.test/p.gif)", IssueCodes.ForbiddenUrl);
        yield return Bad(41, $"![x]({FileUrl}?w=1)", IssueCodes.ForbiddenUrl);
        yield return Bad(42, $"![x]({FileUrl.ToUpperInvariant().Replace("/API/FILES/", "/api/files/")})", IssueCodes.ForbiddenUrl);
        yield return Bad(43, "![x](/api/admin/secret.png)", IssueCodes.ForbiddenUrl);
        yield return Bad(44, "```\ncode\n```", IssueCodes.CodeBlock);
        yield return Bad(45, "Dòng\n\n    code", IssueCodes.CodeBlock);
        yield return Ok(46, "`inline`", None, "inline");
        yield return Bad(47, "[^1] text\n[^1]: note", IssueCodes.UnsupportedSyntax);
        yield return Bad(48, "a ==hl== b", IssueCodes.UnsupportedSyntax);
        yield return Bad(49, "[a][ref]\n[ref]: https://a.test", IssueCodes.ForbiddenUrl);
        yield return Ok(50, "# Tiêu đề :var[A]\n\n- mục :var[B]\n\n> trích", ["A", "B"], "Tiêu đề\nmục\ntrích");
        yield return Ok(51, "| H | K |\n| - | - |\n| :var[A] | x |", ["A"], "H K\nx");
        yield return Ok(52, "- [ ] việc\n- [x] xong", None, "việc\nxong");
        yield return Ok(53, "~~gạch~~ **đậm** *nghiêng*", None, "gạch đậm nghiêng");
        yield return Bad(54, new string('a', 100_001), IssueCodes.TooLong);
    }

    [Theory]
    [MemberData(nameof(Vectors))]
    public void Contract_vector(int number, string markdown, string? expectedError, string[] placeholders, string? text)
    {
        var a = NotificationMarkdown.Analyze(markdown, null);
        if (expectedError is not null)
        {
            Assert.True(Codes(a).Contains(expectedError), $"#{number}: expected {expectedError}, got [{string.Join(", ", Codes(a))}]");
            return;
        }
        Assert.True(a.IsValid, $"#{number}: unexpected {string.Join(", ", a.Issues.Select(i => $"{i.Code}@{i.Line}:{i.Column}"))}");
        Assert.Equal(placeholders, a.Placeholders);
        Assert.Equal(text, a.ContentText);
    }

    // ---- the server's own rules

    [Fact]
    public void Placeholders_must_be_declared()
    {
        Assert.True(NotificationMarkdown.Analyze(":var[A] :var[B]", ["A", "B", "Unused"]).IsValid);
        var a = NotificationMarkdown.Analyze(":var[A] :var[B]", ["A"]);
        Assert.Equal([IssueCodes.UndeclaredPlaceholder], Codes(a));
        Assert.Contains("B", a.Issues.Single().Message);
        Assert.Equal([IssueCodes.UndeclaredPlaceholder], Codes(NotificationMarkdown.Analyze(":var[hoten]", ["HoTen"]))); // case-sensitive
    }

    [Theory]
    [InlineData("Lúc 10:30 ngày mai")]
    [InlineData("Tỷ lệ 1:2, 3:0 và 12:00-13:30")]
    [InlineData("Dùng ngoặc { và }, ${giá} và {{HoTen}}")]
    [InlineData("1<2>3 và x <y chưa đóng")]
    [InlineData("**đậm** *nghiêng* ~~gạch~~ `code`")]
    [InlineData("a\\=\\=b\\=\\=c")]
    [InlineData("Zoom: b, :30, a :b nhé")]
    [InlineData("https://hcmus.edu.vn/a?b=1:2 và www.hcmus.edu.vn và ftp://x.test/f")]
    public void Plain_text_with_tricky_characters_is_valid_and_has_no_placeholders(string markdown)
    {
        var a = NotificationMarkdown.Analyze(markdown, []);
        Assert.True(a.IsValid, string.Join(", ", a.Issues.Select(i => i.Code)));
        Assert.Empty(a.Placeholders);
    }

    [Theory]
    [InlineData("a:b[1] là chỉ mục")]      // a label makes it a directive for remark-directive
    [InlineData("xin chào:name{x=1}")]
    [InlineData("\n::leaf")]
    public void A_label_or_attributes_after_a_name_make_an_unknown_directive(string markdown) =>
        Assert.Contains(IssueCodes.UnknownDirective, Codes(NotificationMarkdown.Analyze(markdown, [])));

    [Theory]
    [InlineData("[x](JAVASCRIPT:a)")]
    [InlineData("[x](vbscript:msgbox)")]
    [InlineData("[x](file:///etc/passwd)")]
    [InlineData("[x](ftp://host/x)")]
    [InlineData("[x]()")]
    [InlineData("[x](&#106;avascript:alert(1))")]
    [InlineData("<ftp://host/x>")]
    public void More_unsafe_links(string markdown) =>
        Assert.Contains(IssueCodes.ForbiddenUrl, Codes(NotificationMarkdown.Analyze(markdown, [])));

    [Fact]
    public void A_placeholder_inside_image_alt_text_is_not_a_placeholder()
    {
        var a = NotificationMarkdown.Analyze($"![xem :var[X]]({FileUrl})", []);
        Assert.True(a.IsValid);
        Assert.Empty(a.Placeholders);
    }

    [Fact]
    public void Placeholders_in_table_cells_and_link_text_are_found()
    {
        var a = NotificationMarkdown.Analyze("| a |\n|---|\n| :var[A] |\n\n[xem :var[B]](https://a.vn)", ["A", "B"]);
        Assert.True(a.IsValid);
        Assert.Equal(["A", "B"], a.Placeholders);
    }

    [Fact]
    public void Control_characters_are_rejected_but_tabs_and_newlines_are_fine()
    {
        Assert.Contains(IssueCodes.InvalidCharacter, Codes(NotificationMarkdown.Analyze("abc\0def", [])));
        Assert.True(NotificationMarkdown.Analyze("tab\there\r\nnewline", []).IsValid);
    }

    [Fact]
    public void Issues_carry_line_and_column_and_every_problem_is_reported()
    {
        var one = NotificationMarkdown.Analyze("dòng 1\n\nxem [x](javascript:a) nhé", []).Issues.Single();
        Assert.Equal(3, one.Line);
        Assert.True(one.Column >= 1);

        var many = NotificationMarkdown.Analyze("<b>x</b> [y](javascript:z) :var[Khac]", ["A"]);
        Assert.Contains(IssueCodes.RawHtml, Codes(many));
        Assert.Contains(IssueCodes.ForbiddenUrl, Codes(many));
        Assert.Contains(IssueCodes.UndeclaredPlaceholder, Codes(many));
    }

    [Fact]
    public void Content_text_keeps_code_text_and_decodes_entities()
    {
        var a = NotificationMarkdown.Analyze("Dùng `x < y` &amp; &copy; ![mô tả ảnh](" + FileUrl + ")", []);
        Assert.Equal("Dùng x < y & © mô tả ảnh", a.ContentText);
    }

    [Fact]
    public void Summary_is_the_first_paragraph_as_one_line()
    {
        Assert.Equal("Đoạn một có hai dòng.", NotificationMarkdown.Analyze("# Tiêu đề\n\nĐoạn một\ncó hai dòng.\n\nĐoạn hai.", []).Summary);
        Assert.Equal("Chỉ có tiêu đề", NotificationMarkdown.Analyze("# Chỉ có tiêu đề", []).Summary);
        Assert.Equal("", NotificationMarkdown.Analyze("", []).Summary);
    }

    [Fact]
    public void Summary_is_at_most_300_characters_and_cut_at_a_word()
    {
        var text = string.Join(' ', Enumerable.Repeat("thâm niên nhà giáo", 40));
        var s = NotificationMarkdown.Analyze(text, []).Summary;
        Assert.True(s.Length <= NotificationMarkdown.SummaryMaxLength);
        Assert.EndsWith("…", s);
        Assert.StartsWith(s[..^1], text);
        Assert.Equal(' ', text[s.Length - 1]); // cut at a word boundary
    }

    [Fact]
    public void Truncate_never_splits_a_surrogate_pair()
    {
        var s = NotificationMarkdown.Truncate(new string('a', 298) + "😀😀😀", 300);
        Assert.True(s.Length <= 300);
        for (var i = 0; i < s.Length; i++)
            if (char.IsHighSurrogate(s[i])) Assert.True(i + 1 < s.Length && char.IsLowSurrogate(s[i + 1]));
    }

    [Fact]
    public void Empty_and_null_bodies_are_valid()
    {
        foreach (var md in new string?[] { null, "", "   \n " })
        {
            var a = NotificationMarkdown.Analyze(md, []);
            Assert.True(a.IsValid);
            Assert.Equal("", a.ContentText);
            Assert.Empty(a.Placeholders);
        }
    }

    [Theory]
    [InlineData("HoTen", true)]
    [InlineData("a", true)]
    [InlineData("A1_b", true)]
    [InlineData("1a", false)]
    [InlineData("_a", false)]
    [InlineData("a b", false)]
    [InlineData("a-b", false)]
    [InlineData("Họ", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void Var_key_pattern(string? key, bool expected) => Assert.Equal(expected, NotificationMarkdown.IsValidVarKey(key));
}
