-- trainings: NS_QuaTrinhBoiDuong (training progress) -> TrainingRow. hrm_id = QuaTrinhBoiDuong.
SELECT CAST(qtbd.QuaTrinhBoiDuong AS int) AS hrm_id,
       LTRIM(RTRIM(ns.MA))                AS employee_code,
       qtbd.NoiDung                       AS content,
       qtbd.NoiBoiDuong                   AS place,
       htdt.TenHinhThucDaoTao             AS training_form,
       qtbd.NgayBatDau                    AS start_on,
       qtbd.NgayKetThuc                   AS end_on
FROM dbo.NS_QuaTrinhBoiDuong qtbd
JOIN dbo.NS_NHANSU ns ON ns.NHANSU = qtbd.NhanSu
LEFT JOIN dbo.DM_HinhThucDaoTao htdt ON qtbd.MaHinhThucDaoTao = htdt.MaHinhThucDaoTao
WHERE ns.MA IS NOT NULL AND LTRIM(RTRIM(ns.MA)) <> N''
ORDER BY qtbd.QuaTrinhBoiDuong;
