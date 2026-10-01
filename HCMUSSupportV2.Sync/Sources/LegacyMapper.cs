using System.Globalization;
using HCMUSSupportV2.Sync.Contracts;

namespace HCMUSSupportV2.Sync.Sources;

/// <summary>
/// Maps the v1 JSON categories (see docs/INVENTORY.md section 4 and docs/jjobs) to the typed ingest rows. Pure: no I/O.
/// Source ids do not exist in the v1 JSON, so <c>hrm_id</c>s are synthesised (<see cref="IdSynthesizer"/>) and org
/// units are derived from the unit / department names of the detailed profile.
/// </summary>
public sealed class LegacyMapper(MappingReport report)
{
    public const string KindAward = "award";
    public const string KindTitle = "title";

    private readonly Dictionary<string, int> _unitIds = new(StringComparer.Ordinal);
    private readonly Dictionary<string, int> _deptIds = new(StringComparer.Ordinal);
    private bool _orgBuilt;

    // ---------- org units (derived) ----------

    /// <summary>Org units from the distinct <c>TenDonVi</c> (unit) and <c>TenPhongBan</c> (department, parented to the unit of
    /// the employees that carry it; a department seen under several units becomes one row per unit).</summary>
    public List<OrgUnitRow> OrgUnits(V1Category detailed)
    {
        BuildOrg(detailed);
        var rows = new List<OrgUnitRow>();
        foreach (var (name, id) in _unitIds.OrderBy(k => k.Key, StringComparer.Ordinal))
            rows.Add(new OrgUnitRow(id, null, "unit", name, null));
        foreach (var (key, id) in _deptIds.OrderBy(k => k.Key, StringComparer.Ordinal))
        {
            var (unit, dept) = SplitDeptKey(key);
            rows.Add(new OrgUnitRow(id, unit is null ? null : _unitIds[unit], "department", dept, null));
        }
        return rows;
    }

    private static string DeptKey(string? unit, string dept) => (unit ?? "") + "\u001f" + dept;

    private static (string? Unit, string Dept) SplitDeptKey(string key)
    {
        var i = key.IndexOf('\u001f');
        var u = key[..i];
        return (u.Length == 0 ? null : u, key[(i + 1)..]);
    }

    private void BuildOrg(V1Category detailed)
    {
        if (_orgBuilt) return;
        _orgBuilt = true;
        var units = new HashSet<string>(StringComparer.Ordinal);
        var depts = new HashSet<string>(StringComparer.Ordinal);
        foreach (var r in detailed.Rows)
        {
            var u = r.Get("TenDonVi"); var d = r.Get("TenPhongBan");
            if (u.Length > 0) units.Add(u);
            if (d.Length > 0) depts.Add(DeptKey(u.Length > 0 ? u : null, d));
        }
        var used = new HashSet<int>();
        foreach (var u in units.OrderBy(x => x, StringComparer.Ordinal)) _unitIds[u] = Unique(used, "unit|" + u);
        foreach (var d in depts.OrderBy(x => x, StringComparer.Ordinal)) _deptIds[d] = Unique(used, "department|" + d);
    }

    private static int Unique(HashSet<int> used, string key)
    {
        var id = IdSynthesizer.Hash("org-units|" + key);
        while (!used.Add(id)) id = id == int.MaxValue - 1 ? IdSynthesizer.Base : id + 1;
        return id;
    }

    // ---------- employees / profiles ----------

    /// <summary>Employees from the detailed profile (units, title, rank, degree) joined with the general one (name). One row per v1
    /// row: an MSCB that appears twice is sent twice and quarantined by the server as <c>duplicate_mscb</c>.</summary>
    public List<EmployeeRow> Employees(V1Category general, V1Category detailed)
    {
        BuildOrg(detailed);
        var rows = new List<EmployeeRow>();
        foreach (var (g, d) in Pair(general, detailed))
        {
            var code = g.Mscb;
            if (code.Length == 0) { report.Add("employee_empty_mscb"); continue; }
            var unitName = d?.Get("TenDonVi") ?? ""; var deptName = d?.Get("TenPhongBan") ?? "";
            int? unit = unitName.Length > 0 ? _unitIds[unitName] : null;
            int? dept = deptName.Length > 0 ? _deptIds[DeptKey(unitName.Length > 0 ? unitName : null, deptName)] : null;
            var fullName = $"{g.Get("HODEM")} {g.Get("TEN")}".Trim();
            if (fullName.Length == 0) { report.Add("employee_empty_name"); fullName = code; }
            rows.Add(new EmployeeRow(null, code, fullName, unit, dept, Nz(d?.Get("TenChucVu")), Nz(d?.Get("TenHocHam")), Nz(d?.Get("TenHocVi"))));
        }
        return rows;
    }

    public List<ProfileRow> Profiles(V1Category general, V1Category detailed)
    {
        var rows = new List<ProfileRow>();
        foreach (var (g, d) in Pair(general, detailed))
        {
            var code = g.Mscb;
            if (code.Length == 0) { report.Add("profile_empty_mscb"); continue; }
            string D(string c) => d?.Get(c) ?? "";

            var dob = DateText.FromParts(g.Get("NGAYSINH"), g.Get("THANGSINH"), g.Get("NAMSINH"));
            if (!dob.Ok) report.Add("bad_date:dateOfBirth");
            var partyOn = Date(D("NGAYVAODANG"), "partyJoinedOn");
            var tuOn = Date(D("NgayVaoCongDoan"), "tradeUnionJoinedOn");

            var sensitive = new SensitiveRow(
                Nz(g.Get("SOCMND")), Date(g.Get("NGAYCAP"), "nationalIdIssuedOn"), Nz(g.Get("NOICAP")), Nz(D("MST")),
                Nz(D("TenNganHang")), Nz(D("NganHangChiNhanh")), Nz(D("SOTAIKHOAN")), Nz(D("BHXH")), Nz(D("BHYT")));
            var hasSensitive = new[]
            {
                sensitive.NationalId, sensitive.NationalIdIssuedOn, sensitive.NationalIdIssuedBy, sensitive.TaxCode, sensitive.BankName,
                sensitive.BankBranch, sensitive.BankAccount, sensitive.SocialInsuranceNo, sensitive.HealthInsuranceNo,
            }.Any(s => s is not null);

            rows.Add(new ProfileRow(
                code, null, Nz(g.Get("HODEM")), Nz(g.Get("TEN")), dob.Value,
                Nz(g.Get("TENGIOITINH")), Nz(g.Get("TenDanToc")), Nz(g.Get("TenTonGiao")), Nz(g.Get("TenQuocTich")),
                Nz(g.Get("NOISINH")), Nz(g.Get("NGUYENQUAN")),
                Nz(g.Get("DIDONG")), Nz(g.Get("DIENTHOAI")), Nz(g.Get("EMAIL")),
                Nz(g.Get("HoKhauThuongTru")), Nz(g.Get("TenPhuongXa")), Nz(g.Get("TenQuanHuyen")), Nz(g.Get("TenTinhThanhPho")),
                Nz(g.Get("DCLL")), Nz(g.Get("TenPhuongXaLienLac")), Nz(g.Get("TenQuanHuyenLienLac")), Nz(g.Get("TenTinhThanhPhoLienLac")),
                Nz(D("Ngach_CongChuc")), null, Int(D("BacCongChuc")), Dec(D("HeSoLuong")), null,
                Nz(D("TenTrinhDoHocVan")), Nz(D("TenChuyenNganh")), Nz(D("TenChinhTri")),
                D("DANGVIENTEXT").Length > 0, partyOn, Nz(D("HSDANG")), Nz(D("THEDANG")),
                D("DOANVIENTEXT").Length > 0, null, Nz(D("HSDOAN")), Nz(D("THEDOAN")),
                D("CongDoanVienText").Length > 0, tuOn, Nz(D("THECONGDOAN")),
                hasSensitive ? sensitive : null));
        }
        return rows;
    }

    /// <summary>Pair the general and detailed rows of each MSCB by position inside the MSCB (both jobs emit the same rows in the same order).</summary>
    private IEnumerable<(V1Row General, V1Row? Detailed)> Pair(V1Category general, V1Category detailed)
    {
        var det = detailed.ByMscb();
        var seen = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var g in general.Rows)
        {
            var i = seen.GetValueOrDefault(g.Mscb);
            seen[g.Mscb] = i + 1;
            var d = det[g.Mscb].Skip(i).FirstOrDefault();
            if (d is null) report.Add("profile_without_detailed");
            yield return (g, d);
        }
    }

    // ---------- child datasets ----------

    public List<SalaryRow> Salary(V1Category c)
    {
        var ids = new IdSynthesizer(Datasets.Salary);
        var rows = new List<SalaryRow>();
        foreach (var r in c.Rows)
        {
            if (!HasCode(r, "salary")) continue;
            rows.Add(new SalaryRow(ids.Next(r.Mscb, r.Content()), r.Mscb,
                Nz(r.Get("Ngach_CongChuc")), null, Int(r.Get("BacCongChuc")), Dec(r.Get("HeSoLuong")), Dec(r.Get("HeSoVuotKhung")),
                Nz(r.Get("SoQuyetDinh")), Date(r.Get("NgayKy"), "signedOn"), Date(r.Get("NgayHuong"), "effectiveFrom"),
                Date(r.Get("MocNangLuongTT"), "nextRaiseOn"), Nz(r.Get("GhiChu"))));
        }
        return rows;
    }

    public List<PositionRow> Positions(V1Category c)
    {
        var ids = new IdSynthesizer(Datasets.Positions);
        var rows = new List<PositionRow>();
        foreach (var r in c.Rows)
        {
            if (!HasCode(r, "position")) continue;
            var title = r.Get("TenChucVu");
            if (title.Length == 0) { report.Add("position_empty_title"); continue; }
            rows.Add(new PositionRow(ids.Next(r.Mscb, r.Content()), r.Mscb, title, Nz(r.Get("MoTa")), Dec(r.Get("HSCV")),
                Date(r.Get("NgayBoNhiem"), "appointedOn"), Nz(r.Get("QuyetDinhBoNhiem")), Date(r.Get("NgayKy"), "signedOn"), null));
        }
        return rows;
    }

    /// <summary>Awards (<c>kind=award</c>, IsDanhHieu=0) and titles (<c>kind=title</c>, IsDanhHieu=1) share one dataset and one id space.</summary>
    public List<CommendationRow> Commendations(V1Category awards, V1Category titles)
    {
        var ids = new IdSynthesizer(Datasets.Commendations);
        var rows = new List<CommendationRow>();
        foreach (var (kind, cat) in new[] { (KindAward, awards), (KindTitle, titles) })
            foreach (var r in cat.Rows)
            {
                if (!HasCode(r, "commendation")) continue;
                var name = r.Get("LyDo");
                if (name.Length == 0) { report.Add("commendation_empty_name"); continue; }
                rows.Add(new CommendationRow(ids.Next(r.Mscb, kind + "\u001e" + r.Content()), r.Mscb, kind, name, null,
                    Nz(r.Get("SoQuyetDinh")), Date(r.Get("Ngay"), "decidedOn")));
            }
        return rows;
    }

    public List<DegreeRow> Degrees(V1Category c)
    {
        var ids = new IdSynthesizer(Datasets.Degrees);
        var rows = new List<DegreeRow>();
        foreach (var r in c.Rows)
        {
            if (!HasCode(r, "degree")) continue;
            rows.Add(new DegreeRow(ids.Next(r.Mscb, r.Content()), r.Mscb, Nz(r.Get("TenLoaiBangCap")), Nz(r.Get("TenChuyenNganh")),
                Nz(r.Get("CoSoDaoTao")), Nz(r.Get("TenQuocTich")), Nz(r.Get("TenHinhThucDaoTao")),
                Date(r.Get("NgayNhapHoc"), "enrolledOn"), Date(r.Get("NgayTotNghiep"), "graduatedOn"), Nz(r.Get("LuanAnTN"))));
        }
        return rows;
    }

    public List<TrainingRow> Trainings(V1Category c)
    {
        var ids = new IdSynthesizer(Datasets.Trainings);
        var rows = new List<TrainingRow>();
        foreach (var r in c.Rows)
        {
            if (!HasCode(r, "training")) continue;
            var content = r.Get("NoiDung");
            if (content.Length == 0) { report.Add("training_empty_content"); continue; }
            rows.Add(new TrainingRow(ids.Next(r.Mscb, r.Content()), r.Mscb, content, Nz(r.Get("NoiBoiDuong")), Nz(r.Get("TenHinhThucDaoTao")),
                Date(r.Get("NgayBatDau"), "startOn"), Date(r.Get("NgayKetThuc"), "endOn")));
        }
        return rows;
    }

    public List<BusinessTripRow> BusinessTrips(V1Category c)
    {
        var ids = new IdSynthesizer(Datasets.BusinessTrips);
        var rows = new List<BusinessTripRow>();
        foreach (var r in c.Rows)
        {
            if (!HasCode(r, "business_trip")) continue;
            // v1 template: "Muc dich: {DiCongTacTheo} ngay {Ngay} cua {Cua}".
            var purpose = r.Get("DiCongTacTheo");
            if (r.Get("Ngay").Length > 0) purpose += " ngày " + r.Get("Ngay");
            if (r.Get("Cua").Length > 0) purpose += " của " + r.Get("Cua");
            rows.Add(new BusinessTripRow(ids.Next(r.Mscb, r.Content()), r.Mscb,
                Date(r.Get("TuNgay"), "fromOn"), Date(r.Get("DenNgay"), "toOn"), Nz(r.Get("NoiLamViec")), Nz(purpose.Trim()),
                Nz(r.Get("PhuongTienDiLai")), Nz(r.Get("SoQuyetDinh1")), Date(r.Get("NgayQuyetDinh1"), "decidedOn"), Nz(r.Get("GhiChu"))));
        }
        return rows;
    }

    public List<InnovationRow> Innovations(V1Category c)
    {
        var ids = new IdSynthesizer(Datasets.Innovations);
        var rows = new List<InnovationRow>();
        foreach (var r in c.Rows)
        {
            if (!HasCode(r, "innovation")) continue;
            var title = r.Get("mo_ta"); var code = r.Get("ma_sk");
            if (title.Length == 0) title = code;
            if (title.Length == 0) { report.Add("innovation_empty_title"); continue; }
            rows.Add(new InnovationRow(ids.Next(r.Mscb, r.Content()), r.Mscb, Nz(code), title, Nz(r.Get("TenLoaiSangKien")),
                Nz(r.Get("SoQuyetDinh")), Date(r.Get("ngay"), "recognizedOn"), null));
        }
        return rows;
    }

    // ---------- helpers ----------

    private bool HasCode(V1Row r, string what)
    {
        if (r.Mscb.Length > 0) return true;
        report.Add(what + "_empty_mscb");
        return false;
    }

    private string? Date(string? text, string field)
    {
        var d = DateText.Normalize(text);
        if (!d.Ok) report.Add("bad_date:" + field);
        return d.Value;
    }

    private static string? Nz(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static int? Int(string? s) => int.TryParse(s?.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var v) ? v : null;

    private static decimal? Dec(string? s) =>
        decimal.TryParse(s?.Trim().Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var v) ? v : null;
}
