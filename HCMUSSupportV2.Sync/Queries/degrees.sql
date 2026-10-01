-- degrees: NS_QuaTrinhDaoTao (academic progress) -> DegreeRow. hrm_id = QuaTrinhDaoTao.
-- FIX vs docs/jjobs/academic-progress.jjob: the country join compared the code column to the NAME column
-- (qtdt.MaQuocTich = dm_qt.TenQuocTich), so most rows had no country. It joins code to code here
-- (NS_NHANSU joins DM_QUOCTICH on MaQuocTich as well).
SELECT CAST(qtdt.QuaTrinhDaoTao AS int) AS hrm_id,
       LTRIM(RTRIM(ns.MA))              AS employee_code,
       lbc.TenLoaiBangCap               AS degree_type,
       cn.TenChuyenNganh                AS major,
       qtdt.CoSoDaoTao                  AS institution,
       qt.TenQuocTich                   AS country,
       htdt.TenHinhThucDaoTao           AS training_form,
       qtdt.NgayNhapHoc                 AS enrolled_on,
       qtdt.NgayTotNghiep               AS graduated_on,
       qtdt.LuanAnTN                    AS thesis_title
FROM dbo.NS_QuaTrinhDaoTao qtdt
JOIN dbo.NS_NHANSU ns ON ns.NHANSU = qtdt.NhanSu
LEFT JOIN dbo.DM_LoaiBangCap    lbc  ON qtdt.MaLoaiBangCap  = lbc.MaLoaiBangCap
LEFT JOIN dbo.DM_HinhThucDaoTao htdt ON qtdt.MaHinhThuc     = htdt.MaHinhThucDaoTao
LEFT JOIN dbo.DM_ChuyenNganh    cn   ON qtdt.MaChuyenNganh  = cn.MaChuyenNganh
LEFT JOIN dbo.DM_QuocTich       qt   ON qtdt.MaQuocTich     = qt.MaQuocTich
WHERE ns.MA IS NOT NULL AND LTRIM(RTRIM(ns.MA)) <> N''
ORDER BY qtdt.QuaTrinhDaoTao;
