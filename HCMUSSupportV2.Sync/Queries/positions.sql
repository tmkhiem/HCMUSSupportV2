-- positions: NS_QuaTrinhChucVu -> PositionRow. hrm_id = QuaTrinhChucVu. ended_on is not selected: no end-date column is
-- documented for this table, so every position is reported as current (null). Add it here once the HRM owner names the column.
SELECT CAST(qtcv.QuaTrinhChucVu AS int) AS hrm_id,
       LTRIM(RTRIM(ns.MA))              AS employee_code,
       cv.TenChucVu                     AS title,
       qtcv.MoTa                        AS unit_description,
       qtcv.HSCV                        AS coefficient,
       qtcv.NgayBoNhiem                 AS appointed_on,
       qtcv.QuyetDinhBoNhiem            AS decision_no,
       qtcv.NgayKy                      AS signed_on,
       CAST(NULL AS datetime)           AS ended_on
FROM dbo.NS_QuaTrinhChucVu qtcv
JOIN dbo.NS_NHANSU ns ON ns.NHANSU = qtcv.NhanSu
JOIN dbo.DM_ChucVu cv ON qtcv.MaChucVu = cv.MaChucVu
WHERE ns.MA IS NOT NULL AND LTRIM(RTRIM(ns.MA)) <> N''
ORDER BY qtcv.QuaTrinhChucVu;
