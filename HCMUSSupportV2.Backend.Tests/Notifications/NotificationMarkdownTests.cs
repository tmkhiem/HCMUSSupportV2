using HCMUSSupportV2.Backend.Modules.Notifications.Markdown;

namespace HCMUSSupportV2.Backend.Tests.Notifications;

/// <summary>Test vectors for the notification Markdown contract (docs/notification-markdown.md).</summary>
public class NotificationMarkdownTests
{
    private static readonly string[] Keys = ["HoTen", "HeSoLuong", "ma_so"];
    private const string FileUrl = "/api/files/0190f3a2-7b1c-7d2e-8f3a-123456789abc";

    private static MarkdownAnalysis Analyze(string md, params string[] keys) =>
        NotificationMarkdown.Analyze(md, keys.Length == 0 ? Keys : keys);

    private static string[] Codes(MarkdownAnalysis a) => a.Issues.Select(i => i.Code).ToArray();

    // ---- accepted

    [Theory]
    [InlineData("Lúc 10:30 ngày mai")]
    [InlineData("Họp lúc 10:30-11:45, phòng B.101")]
    [InlineData("Tỷ lệ 1:2 và tỉ số 3:0")]
    [InlineData("Dùng ngoặc { và } trong văn bản, ${giá} và {{HoTen}}")]
    [InlineData("a < b và c > d, 1<2>3")]
    [InlineData("x <y chưa đóng")]
    [InlineData("Chú ý: xem bên dưới")]
    [InlineData("Địa chỉ https://hcmus.edu.vn/path?a=1:2 và email a@b.vn")]
    [InlineData("**đậm** *nghiêng* ~~gạch~~ `code`")]
    [InlineData("# Tiêu đề\n\n- một\n- hai\n\n1. a\n2. b\n\n> trích dẫn")]
    [InlineData("| a | b |\n|---|---|\n| 1 | 2 |")]
    [InlineData("- [x] xong\n- [ ] chưa")]
    [InlineData("Dấu \\:var[HoTen] được escape nên không phải biến")]
    [InlineData("`:var[HoTen]` trong code span chỉ là chữ")]
    [InlineData("```\n:var[khong hop le] <b>html</b>\n```")]
    public void Accepts_plain_content(string markdown)
    {
        var a = Analyze(markdown);
        Assert.True(a.IsValid, string.Join("; ", a.Issues.Select(i => $"{i.Code}@{i.Line}:{i.Column}")));
        Assert.Empty(a.Placeholders);
    }

    [Fact]
    public void Lists_placeholders_in_order_of_first_use_without_duplicates()
    {
        var a = Analyze("Chào :var[HoTen], hệ số :var[HeSoLuong]. Lại :var[HoTen] và **:var[ma_so]**");
        Assert.True(a.IsValid);
        Assert.Equal(["HoTen", "HeSoLuong", "ma_so"], a.Placeholders);
    }

    [Fact]
    public void Placeholder_inside_a_table_cell_and_a_link_label_is_found()
    {
        var a = Analyze("| Họ tên | Hệ số |\n|---|---|\n| :var[HoTen] | :var[HeSoLuong] |\n\n[xem :var[HoTen]](https://a.vn)");
        Assert.True(a.IsValid, string.Join("; ", Codes(a)));
        Assert.Equal(["HoTen", "HeSoLuong"], a.Placeholders);
    }

    [Fact]
    public void Colon_directly_after_a_letter_run_is_a_directive_only_when_a_name_follows()
    {
        Assert.Equal([IssueCodes.UnsupportedDirective], Codes(Analyze("Zoom :b nhé")));
        Assert.True(Analyze("Zoom: b nhé").IsValid);
        Assert.True(Analyze("Zoom :30").IsValid);
    }

    // ---- rejected

    [Theory]
    [InlineData("<b>đậm</b>")]
    [InlineData("<script>alert(1)</script>")]
    [InlineData("<!-- ẩn -->")]
    [InlineData("Dòng có <span style=\"color:red\">html</span> chen vào")]
    [InlineData("<img src=x onerror=alert(1)>")]
    [InlineData("<br/>")]
    public void Rejects_raw_html(string markdown) =>
        Assert.Contains(IssueCodes.RawHtml, Codes(Analyze(markdown)));

    [Theory]
    [InlineData("[x](javascript:alert(1))")]
    [InlineData("[x](JaVaScRiPt:alert(1))")]
    [InlineData("[x](data:text/html;base64,AAAA)")]
    [InlineData("[x](vbscript:msgbox)")]
    [InlineData("[x](file:///etc/passwd)")]
    [InlineData("[x](//evil.example/x)")]
    [InlineData("[x](ftp://host/x)")]
    [InlineData("[x]()")]
    [InlineData("[x][r]\n\n[r]: javascript:alert(1)")]
    [InlineData("[x](&#106;avascript:alert(1))")]
    public void Rejects_unsafe_links(string markdown) =>
        Assert.Contains(IssueCodes.LinkUrl, Codes(Analyze(markdown)));

    [Theory]
    [InlineData("[x](https://hcmus.edu.vn)")]
    [InlineData("[x](http://hcmus.edu.vn/a?b=c#d)")]
    [InlineData("[x](mailto:a@hcmus.edu.vn)")]
    [InlineData("[x](tel:+84123456789)")]
    [InlineData("[x](/tin-tuc/0190f3a2-7b1c-7d2e-8f3a-123456789abc)")]
    [InlineData("[x](#muc-1)")]
    [InlineData("<https://hcmus.edu.vn>")]
    [InlineData("<a@hcmus.edu.vn>")]
    public void Accepts_safe_links(string markdown)
    {
        var a = Analyze(markdown);
        Assert.True(a.IsValid, string.Join("; ", Codes(a)));
    }

    [Fact]
    public void Images_are_only_allowed_from_api_files()
    {
        Assert.True(Analyze($"![sơ đồ]({FileUrl})").IsValid);
        foreach (var bad in new[]
                 {
                     "![x](https://evil.example/a.png)", "![x](/api/files/not-a-uuid)", $"![x]({FileUrl}?x=1)", $"![x]({FileUrl.ToUpperInvariant()})",
                     "![x](data:image/png;base64,AAAA)", $"![x](//host{FileUrl})", $"![x](https://host{FileUrl})", "![x](/other/path.png)",
                 })
            Assert.Contains(IssueCodes.ImageUrl, Codes(Analyze(bad)));
    }

    [Theory]
    [InlineData(":var[ho ten]", IssueCodes.VarKeyInvalid)]
    [InlineData(":var[1abc]", IssueCodes.VarKeyInvalid)]
    [InlineData(":var[_a]", IssueCodes.VarKeyInvalid)]
    [InlineData(":var[a-b]", IssueCodes.VarKeyInvalid)]
    [InlineData(":var[Họ]", IssueCodes.VarKeyInvalid)]
    [InlineData(":var[]", IssueCodes.VarKeyInvalid)]
    [InlineData(":var[Khac]", IssueCodes.VarUndeclared)]
    [InlineData(":var[hoten]", IssueCodes.VarUndeclared)] // keys are case-sensitive
    [InlineData(":var", IssueCodes.UnsupportedDirective)]
    [InlineData(":var[HoTen]{a=1}", IssueCodes.UnsupportedDirective)]
    [InlineData(":b", IssueCodes.UnsupportedDirective)]
    [InlineData(":note[x]", IssueCodes.UnsupportedDirective)]
    [InlineData("::leaf[x]", IssueCodes.UnsupportedDirective)]
    [InlineData(":::box\nnội dung\n:::", IssueCodes.UnsupportedDirective)]
    public void Rejects_bad_placeholders_and_other_directives(string markdown, string expected) =>
        Assert.Contains(expected, Codes(Analyze(markdown)));

    [Fact]
    public void Key_longer_than_64_is_rejected_and_64_is_accepted()
    {
        var ok = "A" + new string('b', 63);
        Assert.True(NotificationMarkdown.Analyze($":var[{ok}]", [ok]).IsValid);
        var tooLong = ok + "c";
        Assert.Contains(IssueCodes.VarKeyInvalid, Codes(NotificationMarkdown.Analyze($":var[{tooLong}]", [tooLong])));
    }

    [Fact]
    public void Declared_check_is_skipped_when_no_keys_are_given()
    {
        var a = NotificationMarkdown.Analyze(":var[Bat_Ky]", null);
        Assert.True(a.IsValid);
        Assert.Equal(["Bat_Ky"], a.Placeholders);
    }

    [Fact]
    public void Control_characters_are_rejected()
    {
        Assert.Contains(IssueCodes.ControlCharacter, Codes(Analyze("abc\0def")));
        Assert.True(Analyze("tab\there\r\nnewline").IsValid);
    }

    [Fact]
    public void Issues_carry_line_and_column()
    {
        var issue = Analyze("dòng 1\n\nxem [x](javascript:a) nhé").Issues.Single();
        Assert.Equal(3, issue.Line);
        Assert.True(issue.Column >= 1);
    }

    [Fact]
    public void Reports_every_problem_not_just_the_first()
    {
        var a = Analyze("<b>x</b> [y](javascript:z) :var[Khac] :q");
        Assert.Contains(IssueCodes.RawHtml, Codes(a));
        Assert.Contains(IssueCodes.LinkUrl, Codes(a));
        Assert.Contains(IssueCodes.VarUndeclared, Codes(a));
        Assert.Contains(IssueCodes.UnsupportedDirective, Codes(a));
    }

    // ---- content_text and summary

    [Fact]
    public void Content_text_is_plain_text_with_placeholders_as_their_key()
    {
        var a = Analyze("# Thông báo\n\nKính gửi **:var[HoTen]**, hệ số mới là *:var[HeSoLuong]*.\n\n- mục một\n- mục [hai](https://a.vn)\n\n| a | b |\n|---|---|\n| 1 | 2 |");
        Assert.Equal("Thông báo\nKính gửi HoTen, hệ số mới là HeSoLuong.\nmục một\nmục hai\na b\n1 2", a.ContentText);
    }

    [Fact]
    public void Content_text_keeps_code_and_decodes_entities()
    {
        var a = Analyze("Dùng `x < y` &amp; &copy; ![mô tả ảnh](" + FileUrl + ")");
        Assert.Equal("Dùng x < y & © mô tả ảnh", a.ContentText);
    }

    [Fact]
    public void Summary_is_the_first_paragraph_as_one_line()
    {
        var a = Analyze("# Tiêu đề\n\nĐoạn một\ncó hai dòng.\n\nĐoạn hai.");
        Assert.Equal("Đoạn một có hai dòng.", a.Summary);
    }

    [Fact]
    public void Summary_falls_back_to_first_text_when_there_is_no_paragraph()
    {
        Assert.Equal("Chỉ có tiêu đề", Analyze("# Chỉ có tiêu đề").Summary);
        Assert.Equal("", Analyze("").Summary);
    }

    [Fact]
    public void Summary_is_at_most_300_characters_and_cut_at_a_word()
    {
        var text = string.Join(' ', Enumerable.Repeat("thâm niên nhà giáo", 40));
        var s = Analyze(text).Summary;
        Assert.True(s.Length <= NotificationMarkdown.SummaryMaxLength);
        Assert.EndsWith("…", s);
        Assert.DoesNotContain("  ", s);
        Assert.True(text.StartsWith(s[..^1]));
    }

    [Fact]
    public void Truncate_never_splits_a_surrogate_pair()
    {
        var text = new string('a', 298) + "😀😀😀";
        var s = NotificationMarkdown.Truncate(text, 300);
        Assert.True(s.Length <= 300);
        Assert.DoesNotContain(s, ch => char.IsSurrogate(ch) && !char.IsSurrogatePair(s, s.IndexOf(ch)) && ch != '…');
    }

    [Fact]
    public void Empty_and_null_bodies_are_valid_with_empty_results()
    {
        foreach (var md in new string?[] { null, "", "   \n " })
        {
            var a = NotificationMarkdown.Analyze(md, Keys);
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
    [InlineData("", false)]
    [InlineData(null, false)]
    public void Var_key_pattern(string? key, bool expected) => Assert.Equal(expected, NotificationMarkdown.IsValidVarKey(key));
}
