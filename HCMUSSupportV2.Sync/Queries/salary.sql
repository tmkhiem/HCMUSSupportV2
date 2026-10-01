-- salary: NS_QuaTrinhLuong (salary progress) -> SalaryRow. hrm_id = QuaTrinhLuong (source PK).
-- The grade / step / coefficient are the ones recorded on the progress row (qtl), not the employee's current ones.
SELECT CAST(qtl.QuaTrinhLuong AS int)   AS hrm_id,
       LTRIM(RTRIM(ns.MA))              AS employee_code,
       qtl.Ngach_CongChuc               AS grade_code,
       CAST(NULL AS nvarchar(200))      AS grade_name,
       qtl.BacCongChuc                  AS step,
       qtl.HeSoLuong                    AS coefficient,
       qtl.HeSoVuotKhung                AS over_grade_pct,
       qtl.SoQuyetDinh                  AS decision_no,
       qtl.NgayKy                       AS signed_on,
       qtl.NgayHuong                    AS effective_from,
       qtl.MocNangLuongTT               AS next_raise_on,
       qtl.GhiChu                       AS note
FROM dbo.NS_QuaTrinhLuong qtl
JOIN dbo.NS_NHANSU ns ON qtl.NhanSu = ns.NHANSU
WHERE ns.MA IS NOT NULL AND LTRIM(RTRIM(ns.MA)) <> N''
ORDER BY qtl.QuaTrinhLuong;
