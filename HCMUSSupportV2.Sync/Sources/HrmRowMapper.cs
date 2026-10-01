using System.Data;
using System.Globalization;
using HCMUSSupportV2.Sync.Contracts;

namespace HCMUSSupportV2.Sync.Sources;

/// <summary>
/// Maps one result row of a <c>Queries/*.sql</c> file to the typed ingest record. The SQL aliases every column to the
/// snake_case name read here (<c>hrm_id</c>, <c>employee_code</c>, ...), so the mapping has no knowledge of HRM table layouts
/// and can be unit-tested with a <see cref="System.Data.DataTableReader"/>. Date columns may be real dates or the free-text
/// strings the HRM tables hold (<c>2012</c>, <c>05/2013</c>, <c>dd/MM/yyyy</c>); both keep their precision.
/// </summary>
public sealed class HrmRowMapper(MappingReport report)
{
    public OrgUnitRow? OrgUnit(IDataRecord r)
    {
        var id = Int(r, "hrm_id");
        var name = Str(r, "name");
        if (id is null || name is null) { report.Add("org_unit_bad_row"); return null; }
        return new OrgUnitRow(id.Value, Int(r, "parent_hrm_id"), Str(r, "kind") ?? "unit", name, Str(r, "code"), Bool(r, "is_active", true));
    }

    public EmployeeRow? Employee(IDataRecord r)
    {
        var code = Str(r, "code");
        if (code is null) { report.Add("employee_empty_mscb"); return null; }
        var name = Str(r, "full_name");
        if (name is null) { report.Add("employee_empty_name"); name = code; }
        return new EmployeeRow(Int(r, "hrm_id"), code, name, Int(r, "org_unit_hrm_id"), Int(r, "department_hrm_id"),
            Str(r, "position_title"), Str(r, "academic_rank"), Str(r, "degree"), Str(r, "status") ?? "active");
    }

    public ProfileRow? Profile(IDataRecord r)
    {
        var code = Str(r, "employee_code");
        if (code is null) { report.Add("profile_empty_mscb"); return null; }

        var dob = DateText.FromParts(Str(r, "birth_day"), Str(r, "birth_month"), Str(r, "birth_year"));
        if (!dob.Ok) report.Add("bad_date:dateOfBirth");

        var sensitive = new SensitiveRow(
            Str(r, "national_id"), Date(r, "national_id_issued_on"), Str(r, "national_id_issued_by"), Str(r, "tax_code"),
            Str(r, "bank_name"), Str(r, "bank_branch"), Str(r, "bank_account"), Str(r, "social_insurance_no"), Str(r, "health_insurance_no"));
        var hasSensitive = new[]
        {
            sensitive.NationalId, sensitive.NationalIdIssuedOn, sensitive.NationalIdIssuedBy, sensitive.TaxCode, sensitive.BankName,
            sensitive.BankBranch, sensitive.BankAccount, sensitive.SocialInsuranceNo, sensitive.HealthInsuranceNo,
        }.Any(s => s is not null);

        return new ProfileRow(
            code, Int(r, "hrm_id"), Str(r, "last_name"), Str(r, "first_name"), dob.Value,
            Str(r, "gender"), Str(r, "ethnicity"), Str(r, "religion"), Str(r, "nationality"), Str(r, "birth_place"), Str(r, "hometown"),
            Str(r, "phone_mobile"), Str(r, "phone_home"), Str(r, "personal_email"),
            Str(r, "permanent_address"), Str(r, "permanent_ward"), Str(r, "permanent_district"), Str(r, "permanent_province"),
            Str(r, "contact_address"), Str(r, "contact_ward"), Str(r, "contact_district"), Str(r, "contact_province"),
            Str(r, "salary_grade_code"), Str(r, "salary_grade_name"), Int(r, "salary_step"), Dec(r, "salary_coefficient"), Dec(r, "over_grade_pct"),
            Str(r, "education_level"), Str(r, "major"), Str(r, "political_theory"),
            Bool(r, "is_party_member"), Date(r, "party_joined_on"), Str(r, "party_file_no"), Str(r, "party_card_no"),
            Bool(r, "is_youth_union_member"), Date(r, "youth_union_joined_on"), Str(r, "youth_file_no"), Str(r, "youth_card_no"),
            Bool(r, "is_trade_union_member"), Date(r, "trade_union_joined_on"), Str(r, "trade_union_card_no"),
            hasSensitive ? sensitive : null);
    }

    public SalaryRow? Salary(IDataRecord r)
    {
        if (!Key(r, "salary", out var id, out var code)) return null;
        return new SalaryRow(id, code, Str(r, "grade_code"), Str(r, "grade_name"), Int(r, "step"), Dec(r, "coefficient"), Dec(r, "over_grade_pct"),
            Str(r, "decision_no"), Date(r, "signed_on"), Date(r, "effective_from"), Date(r, "next_raise_on"), Str(r, "note"));
    }

    public PositionRow? Position(IDataRecord r)
    {
        if (!Key(r, "position", out var id, out var code)) return null;
        var title = Str(r, "title");
        if (title is null) { report.Add("position_empty_title"); return null; }
        return new PositionRow(id, code, title, Str(r, "unit_description"), Dec(r, "coefficient"),
            Date(r, "appointed_on"), Str(r, "decision_no"), Date(r, "signed_on"), Date(r, "ended_on"));
    }

    public CommendationRow? Commendation(IDataRecord r)
    {
        if (!Key(r, "commendation", out var id, out var code)) return null;
        var name = Str(r, "name");
        if (name is null) { report.Add("commendation_empty_name"); return null; }
        var kind = Str(r, "kind") ?? "award";
        return new CommendationRow(id, code, kind, name, Str(r, "academic_year"), Str(r, "decision_no"), Date(r, "decided_on"));
    }

    public DegreeRow? Degree(IDataRecord r)
    {
        if (!Key(r, "degree", out var id, out var code)) return null;
        return new DegreeRow(id, code, Str(r, "degree_type"), Str(r, "major"), Str(r, "institution"), Str(r, "country"),
            Str(r, "training_form"), Date(r, "enrolled_on"), Date(r, "graduated_on"), Str(r, "thesis_title"));
    }

    public TrainingRow? Training(IDataRecord r)
    {
        if (!Key(r, "training", out var id, out var code)) return null;
        var content = Str(r, "content");
        if (content is null) { report.Add("training_empty_content"); return null; }
        return new TrainingRow(id, code, content, Str(r, "place"), Str(r, "training_form"), Date(r, "start_on"), Date(r, "end_on"));
    }

    public BusinessTripRow? BusinessTrip(IDataRecord r)
    {
        if (!Key(r, "business_trip", out var id, out var code)) return null;
        return new BusinessTripRow(id, code, Date(r, "from_on"), Date(r, "to_on"), Str(r, "place"), Str(r, "purpose"), Str(r, "transport"),
            Str(r, "decision_no"), Date(r, "decided_on"), Str(r, "note"));
    }

    public InnovationRow? Innovation(IDataRecord r)
    {
        if (!Key(r, "innovation", out var id, out var code)) return null;
        var code2 = Str(r, "code");
        var title = Str(r, "title") ?? code2;
        if (title is null) { report.Add("innovation_empty_title"); return null; }
        return new InnovationRow(id, code, code2, title, Str(r, "type"), Str(r, "decision_no"), Date(r, "recognized_on"), Str(r, "academic_year"));
    }

    // ---------- column helpers ----------

    private bool Key(IDataRecord r, string what, out int id, out string code)
    {
        id = 0; code = "";
        var i = Int(r, "hrm_id");
        var c = Str(r, "employee_code");
        if (i is null) { report.Add(what + "_no_hrm_id"); return false; }
        if (c is null) { report.Add(what + "_empty_mscb"); return false; }
        id = i.Value; code = c;
        return true;
    }

    private static int Ordinal(IDataRecord r, string name)
    {
        try { return r.GetOrdinal(name); }
        catch (IndexOutOfRangeException) { throw new InvalidOperationException($"Query result has no column '{name}'."); }
    }

    private static object? Raw(IDataRecord r, string name)
    {
        var o = Ordinal(r, name);
        return r.IsDBNull(o) ? null : r.GetValue(o);
    }

    public static string? Str(IDataRecord r, string name)
    {
        var v = Raw(r, name);
        var s = v switch
        {
            null => null,
            string t => t,
            DateTime d => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
            _ => v.ToString(),
        };
        return string.IsNullOrWhiteSpace(s) ? null : s.Trim();
    }

    public static int? Int(IDataRecord r, string name)
    {
        var v = Raw(r, name);
        return v switch
        {
            null => null,
            int i => i,
            string s => int.TryParse(s.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) ? n : null,
            IConvertible c => Convert.ToInt32(c, CultureInfo.InvariantCulture),
            _ => null,
        };
    }

    public static decimal? Dec(IDataRecord r, string name)
    {
        var v = Raw(r, name);
        return v switch
        {
            null => null,
            decimal d => d,
            string s => decimal.TryParse(s.Trim().Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var n) ? n : null,
            IConvertible c => Convert.ToDecimal(c, CultureInfo.InvariantCulture),
            _ => null,
        };
    }

    public static bool Bool(IDataRecord r, string name, bool defaultValue = false)
    {
        var v = Raw(r, name);
        return v switch
        {
            null => defaultValue,
            bool b => b,
            string s => s is "1" || s.Equals("true", StringComparison.OrdinalIgnoreCase),
            IConvertible c => Convert.ToInt64(c, CultureInfo.InvariantCulture) != 0,
            _ => defaultValue,
        };
    }

    private string? Date(IDataRecord r, string name)
    {
        var v = Raw(r, name);
        if (v is null) return null;
        if (v is DateTime d) return d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var n = DateText.Normalize(v.ToString());
        if (!n.Ok) report.Add("bad_date:" + name);
        return n.Value;
    }
}
