using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HCMUSSupportV2.Backend.Modules.Hrm.Me;

/// <summary>
/// Self-service reads of the signed-in employee's own HRM records. The employee is always
/// <see cref="ICurrentUser.RequireEffectiveCode"/>: the signed-in code, or the viewed employee during an admin's
/// view-as session (read-only, audited by the view-as middleware, D14a). There is no code parameter anywhere, so
/// nobody can ask for someone else's rows.
/// </summary>
[ApiController]
[Route("api/me")]
[Authorize(Policy = Policies.Employee)]
public class MeController(MeService me, ICurrentUser user, IAuditLogger audit) : ControllerBase
{
    private string Code => user.RequireEffectiveCode();

    [HttpGet("profile/overview")]
    [ProducesResponseType<ProfileOverviewDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Overview(CancellationToken ct) => OkOrNotFound(await me.OverviewAsync(Code, ct));

    [HttpGet("profile/general")]
    [ProducesResponseType<GeneralProfileDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> General(CancellationToken ct) => OkOrNotFound(await me.GeneralAsync(Code, ct));

    /// <summary>Sensitive values (national id, tax code, bank account, insurance numbers) come back masked as <c>•••• 1234</c>.</summary>
    [HttpGet("profile/detailed")]
    [ProducesResponseType<DetailedProfileDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Detailed(CancellationToken ct) => OkOrNotFound(await me.DetailedAsync(Code, ct));

    /// <summary>
    /// Returns the full value of one masked field of the signed-in employee's own record and writes the audit entry
    /// <c>profile.sensitive_reveal</c> first. <c>field</c> is one of <c>national_id</c>, <c>tax_code</c>, <c>bank_account</c>,
    /// <c>social_insurance_no</c>, <c>health_insurance_no</c>. Refused with 403 during a view-as session (view-as is
    /// read-only and must not expose secrets, even to an admin); 404 when the field has no value.
    /// </summary>
    [HttpPost("profile/sensitive/reveal")]
    [ProducesResponseType<RevealResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Reveal([FromBody] RevealRequest request, CancellationToken ct)
    {
        if (user.IsActingAs)
            return Problem(title: "Reveal not allowed while viewing as another employee",
                detail: "Không thể xem thông tin nhạy cảm khi đang xem với tư cách người khác.", statusCode: StatusCodes.Status403Forbidden);

        var field = request.Field?.Trim().ToLowerInvariant() ?? "";
        if (!MeService.SensitiveFields.Contains(field))
            return Problem(title: "Unknown sensitive field", detail: $"Trường không hợp lệ. Chọn một trong: {string.Join(", ", MeService.SensitiveFields)}.",
                statusCode: StatusCodes.Status400BadRequest);

        var code = user.RequireCode();
        var value = await me.SensitiveValueAsync(code, field, ct);
        if (string.IsNullOrEmpty(value))
            return Problem(title: "No value", detail: "Chưa có dữ liệu cho trường này.", statusCode: StatusCodes.Status404NotFound);

        // Audit first: if it cannot be written, the value is not released.
        await audit.LogAsync("profile.sensitive_reveal", "employee", code, new { field }, ct);
        return Ok(new RevealResponse(field, value));
    }

    [HttpGet("salary")]
    [ProducesResponseType<SalaryDto>(StatusCodes.Status200OK)]
    public async Task<SalaryDto> Salary(CancellationToken ct) => await me.SalaryAsync(Code, ct);

    [HttpGet("positions")]
    [ProducesResponseType<PositionsDto>(StatusCodes.Status200OK)]
    public async Task<PositionsDto> Positions(CancellationToken ct) => await me.PositionsAsync(Code, ct);

    [HttpGet("commendations")]
    [ProducesResponseType<CommendationsDto>(StatusCodes.Status200OK)]
    public async Task<CommendationsDto> Commendations(CancellationToken ct) => await me.CommendationsAsync(Code, ct);

    [HttpGet("degrees")]
    [ProducesResponseType<IReadOnlyList<DegreeEntryDto>>(StatusCodes.Status200OK)]
    public async Task<IReadOnlyList<DegreeEntryDto>> Degrees(CancellationToken ct) => await me.DegreesAsync(Code, ct);

    [HttpGet("trainings")]
    [ProducesResponseType<IReadOnlyList<TrainingEntryDto>>(StatusCodes.Status200OK)]
    public async Task<IReadOnlyList<TrainingEntryDto>> Trainings(CancellationToken ct) => await me.TrainingsAsync(Code, ct);

    [HttpGet("business-trips")]
    [ProducesResponseType<BusinessTripsDto>(StatusCodes.Status200OK)]
    public async Task<BusinessTripsDto> BusinessTrips(CancellationToken ct) => await me.BusinessTripsAsync(Code, ct);

    [HttpGet("innovations")]
    [ProducesResponseType<InnovationsDto>(StatusCodes.Status200OK)]
    public async Task<InnovationsDto> Innovations([FromQuery] string? q, [FromQuery] long? cursor, [FromQuery] int? limit, CancellationToken ct) =>
        await me.InnovationsAsync(Code, q, cursor, limit, ct);

    /// <summary>Teaching load of one academic year (default: the latest one the employee has).</summary>
    [HttpGet("teaching")]
    [ProducesResponseType<TeachingDto>(StatusCodes.Status200OK)]
    public async Task<TeachingDto> Teaching([FromQuery] string? year, CancellationToken ct) => await me.TeachingAsync(Code, year, ct);

    [HttpGet("teaching/years")]
    [ProducesResponseType<IReadOnlyList<string>>(StatusCodes.Status200OK)]
    public async Task<IReadOnlyList<string>> TeachingYears(CancellationToken ct) => await me.TeachingYearsAsync(Code, ct);

    [HttpGet("research/projects")]
    [ProducesResponseType<PageDto<ResearchProjectDto>>(StatusCodes.Status200OK)]
    public async Task<PageDto<ResearchProjectDto>> ResearchProjects([FromQuery] string? q, [FromQuery] long? cursor, [FromQuery] int? limit, CancellationToken ct) =>
        await me.ResearchProjectsAsync(Code, q, cursor, limit, ct);

    [HttpGet("research/publications")]
    [ProducesResponseType<PageDto<PublicationDto>>(StatusCodes.Status200OK)]
    public async Task<PageDto<PublicationDto>> Publications([FromQuery] string? q, [FromQuery] long? cursor, [FromQuery] int? limit, CancellationToken ct) =>
        await me.PublicationsAsync(Code, q, cursor, limit, ct);

    private IActionResult OkOrNotFound<T>(T? value) where T : class => value is null ? NotFound() : Ok(value);
}
