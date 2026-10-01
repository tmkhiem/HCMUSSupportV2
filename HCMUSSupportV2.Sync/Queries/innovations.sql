-- innovations: NS_QuaTrinhSangKien -> InnovationRow. hrm_id = QuaTrinhSangKien.
-- LyDo holds "<code>\n<title>" or "<code> - <title>"; it is split into code (ma_sk) and title (mo_ta) exactly as the v1 job did.
-- Changes vs docs/jjobs/innovation.jjob: the date is returned as a real date (v1 converted to dd/MM/yyyy and then sorted that
-- text), and the loai-sang-kien join is LEFT so a record without a type is not dropped.
WITH cte AS (
    SELECT sk.QuaTrinhSangKien,
           ns.MA,
           sk.SoQuyetDinh,
           CASE
               WHEN PATINDEX('%' + CHAR(10) + '%', sk.LyDo) > 0 THEN LTRIM(RTRIM(SUBSTRING(sk.LyDo, 1, PATINDEX('%' + CHAR(10) + '%', sk.LyDo) - 1)))
               WHEN PATINDEX('% - %', sk.LyDo) > 0 THEN LTRIM(RTRIM(SUBSTRING(sk.LyDo, 1, PATINDEX('% - %', sk.LyDo) - 1)))
               ELSE sk.LyDo
           END AS ma_sk,
           CASE
               WHEN PATINDEX('%' + CHAR(10) + '%', sk.LyDo) > 0 THEN LTRIM(RTRIM(SUBSTRING(sk.LyDo, PATINDEX('%' + CHAR(10) + '%', sk.LyDo) + 1, LEN(sk.LyDo))))
               WHEN PATINDEX('% - %', sk.LyDo) > 0 THEN LTRIM(RTRIM(SUBSTRING(sk.LyDo, PATINDEX('% - %', sk.LyDo) + 3, LEN(sk.LyDo))))
               ELSE N''
           END AS mo_ta,
           lsk.TenLoaiSangKien,
           sk.Ngay
    FROM dbo.NS_QuaTrinhSangKien sk
    JOIN dbo.NS_NHANSU ns ON sk.NhanSu = ns.NHANSU
    LEFT JOIN dbo.DM_LoaiSangKien lsk ON sk.MaLoaiSangKien = lsk.MaLoaiSangKien
    WHERE ns.MA IS NOT NULL AND LTRIM(RTRIM(ns.MA)) <> N''
)
SELECT CAST(QuaTrinhSangKien AS int) AS hrm_id,
       LTRIM(RTRIM(MA))              AS employee_code,
       -- same trailing-punctuation trim as v1 (cut after the last letter or digit)
       LEFT(ma_sk, LEN(ma_sk) - PATINDEX('%[a-zA-Z0-9]%', REVERSE(ma_sk)) + 1) AS code,
       mo_ta                         AS title,
       TenLoaiSangKien               AS type,
       SoQuyetDinh                   AS decision_no,
       Ngay                          AS recognized_on,
       CAST(NULL AS nvarchar(20))    AS academic_year
FROM cte
ORDER BY QuaTrinhSangKien;
