-- business-trips: NS_QuaTrinhCongTac (business mission) -> BusinessTripRow. hrm_id = QuaTrinhCongTac.
-- FIX vs docs/jjobs/business-mission.jjob: that job still carried a debug filter (a WHERE on one hard-coded MSCB) and a 1000-row cap,
-- so only one employee's rows were ever published. Both are gone: this is the full table.
-- purpose composes the v1 template line "{DiCongTacTheo} ngay {Ngay} cua {Cua}".
SELECT CAST(qtct.QuaTrinhCongTac AS int) AS hrm_id,
       LTRIM(RTRIM(ns.MA))               AS employee_code,
       qtct.TuNgay                       AS from_on,
       qtct.DenNgay                      AS to_on,
       qtct.NoiLamViec                   AS place,
       LTRIM(RTRIM(CONCAT(qtct.DiCongTacTheo,
                          CASE WHEN qtct.Ngay IS NULL OR LTRIM(RTRIM(CONVERT(nvarchar(30), qtct.Ngay, 103))) = N''
                               THEN N'' ELSE N' ngày ' + CONVERT(nvarchar(30), qtct.Ngay, 103) END,
                          CASE WHEN qtct.Cua IS NULL OR LTRIM(RTRIM(qtct.Cua)) = N''
                               THEN N'' ELSE N' của ' + qtct.Cua END))) AS purpose,
       qtct.PhuongTienDiLai              AS transport,
       qtct.SoQuyetDinh1                 AS decision_no,
       qtct.NgayQuyetDinh1               AS decided_on,
       qtct.GhiChu                       AS note
FROM dbo.NS_QuaTrinhCongTac qtct
JOIN dbo.NS_NHANSU ns ON qtct.NhanSu = ns.NHANSU
WHERE ns.MA IS NOT NULL AND LTRIM(RTRIM(ns.MA)) <> N''
ORDER BY qtct.QuaTrinhCongTac;
