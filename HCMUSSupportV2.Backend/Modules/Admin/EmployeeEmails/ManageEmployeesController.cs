using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Groups;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HCMUSSupportV2.Backend.Modules.Admin.EmployeeEmails;

/// <summary>
/// "Nhân sự &amp; email" for editors (PLAN §5, §7.3): the employee directory with the MSCB to email mapping, plus the
/// bulk import. Reading needs <see cref="Policies.ViewEmployeeDirectory"/>, writing <see cref="Policies.ManageEmployeeEmails"/>
/// (both editor level). Every write is audited.
/// </summary>
[ApiController]
[Route("api/manage/employees")]
[TypeFilter<GroupsExceptionFilter>]
public class ManageEmployeesController(EmployeeEmailsService emails, EmployeeEmailImportService import) : ControllerBase
{
    /// <summary>
    /// Directory ordered by MSCB with keyset paging. <c>q</c> matches the MSCB prefix, the name without accents or any
    /// email fragment. Filters: <c>status</c>, <c>unitId</c>, <c>hasEmail</c> and <c>flagged</c> (an email equals the HRM
    /// personal email of another employee).
    /// </summary>
    [HttpGet]
    [Authorize(Policy = Policies.ViewEmployeeDirectory)]
    [ProducesResponseType<ManagedEmployeePageDto>(StatusCodes.Status200OK)]
    public async Task<ManagedEmployeePageDto> List([FromQuery] string? q, [FromQuery] string? status, [FromQuery] bool? hasEmail,
        [FromQuery] bool? flagged, [FromQuery] long? unitId, [FromQuery] string? cursor, [FromQuery] int limit = 50, CancellationToken ct = default) =>
        await emails.ListAsync(q, status, hasEmail, flagged, unitId, cursor, limit, ct);

    [HttpGet("{code}")]
    [Authorize(Policy = Policies.ViewEmployeeDirectory)]
    [ProducesResponseType<ManagedEmployeeDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ManagedEmployeeDto> Get(string code, CancellationToken ct) =>
        await emails.GetAsync(code, ct) ?? throw EmployeeEmailsService.NotFound();

    /// <summary>
    /// Maps an email to the employee. The first email is primary; <c>isPrimary</c> makes a later one primary. 409 when
    /// the email is already mapped (to this or another MSCB), 400 for a malformed email or more than 10 emails.
    /// </summary>
    [HttpPost("{code}/emails")]
    [Authorize(Policy = Policies.ManageEmployeeEmails)]
    [ProducesResponseType<ManagedEmployeeDto>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> AddEmail(string code, [FromBody] AddEmployeeEmailRequest request, CancellationToken ct)
    {
        var dto = await emails.AddAsync(code, request, ct);
        return Created($"/api/manage/employees/{code}", dto);
    }

    /// <summary>
    /// Removes a mapping (the oldest remaining email becomes primary when the primary goes). 409 when it is your own last
    /// email or the last email of the last active admin. An open session continues until it expires or the employee is
    /// deactivated, but the person can no longer sign in with that address.
    /// </summary>
    [HttpDelete("{code}/emails/{email}")]
    [Authorize(Policy = Policies.ManageEmployeeEmails)]
    [ProducesResponseType<ManagedEmployeeDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ManagedEmployeeDto> RemoveEmail(string code, string email, CancellationToken ct) =>
        await emails.RemoveAsync(code, email, ct);

    [HttpPut("{code}/emails/{email}/primary")]
    [Authorize(Policy = Policies.ManageEmployeeEmails)]
    [ProducesResponseType<ManagedEmployeeDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ManagedEmployeeDto> SetPrimary(string code, string email, CancellationToken ct) =>
        await emails.SetPrimaryAsync(code, email, ct);

    /// <summary>
    /// Bulk import from an <c>.xlsx</c> or <c>.csv</c> (multipart field <c>file</c>; header columns MSCB, Họ tên, Email 1..).
    /// <c>dryRun=true</c> (default) only reports; upload the same file with <c>dryRun=false</c> to apply. With
    /// <c>removeMissing=true</c> the listed MSCB keep exactly the emails in the file.
    /// </summary>
    [HttpPost("emails/import")]
    [Authorize(Policy = Policies.ManageEmployeeEmails)]
    [RequestSizeLimit(EmployeeEmailImportService.MaxBytes + 64 * 1024)]
    [ProducesResponseType<EmailImportReportDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<EmailImportReportDto> ImportEmails(IFormFile file, [FromQuery] bool dryRun = true,
        [FromQuery] bool removeMissing = false, CancellationToken ct = default)
    {
        if (file is null || file.Length == 0) throw GroupsException.BadRequest("No file", "Chưa chọn tệp hoặc tệp rỗng.");
        if (file.Length > EmployeeEmailImportService.MaxBytes) throw GroupsException.BadRequest("File too large", "Tệp tối đa 5 MB.");
        await using var stream = file.OpenReadStream();
        return await import.ImportAsync(stream, file.FileName, dryRun, removeMissing, ct);
    }
}
