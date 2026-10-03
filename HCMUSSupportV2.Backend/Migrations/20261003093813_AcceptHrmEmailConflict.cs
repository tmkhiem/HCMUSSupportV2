using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HCMUSSupportV2.Backend.Migrations
{
    /// <inheritdoc />
    public partial class AcceptHrmEmailConflict : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "hrm_conflict_accepted_at",
                table: "employee_emails",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "hrm_conflict_accepted_by",
                table: "employee_emails",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "hrm_conflict_accepted_at",
                table: "employee_emails");

            migrationBuilder.DropColumn(
                name: "hrm_conflict_accepted_by",
                table: "employee_emails");
        }
    }
}
