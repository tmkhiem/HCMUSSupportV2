-- commendations: NS_QuaTrinhKhenThuong -> CommendationRow. One table feeds both v1 categories: IsDanhHieu = 0 is
-- "award" (khen thuong), IsDanhHieu = 1 is "title" (danh hieu). hrm_id = QuaTrinhKhenThuong (source PK, unique across both kinds).
SELECT CAST(qtkt.QuaTrinhKhenThuong AS int)                    AS hrm_id,
       LTRIM(RTRIM(ns.MA))                                     AS employee_code,
       CASE WHEN qtkt.IsDanhHieu = 1 THEN N'title' ELSE N'award' END AS kind,
       qtkt.LyDo                                               AS name,
       CAST(NULL AS nvarchar(20))                              AS academic_year,
       qtkt.SoQuyetDinh                                        AS decision_no,
       qtkt.Ngay                                               AS decided_on
FROM dbo.NS_QuaTrinhKhenThuong qtkt
JOIN dbo.NS_NHANSU ns ON qtkt.NhanSu = ns.NHANSU
WHERE ns.MA IS NOT NULL AND LTRIM(RTRIM(ns.MA)) <> N''
ORDER BY qtkt.QuaTrinhKhenThuong;
