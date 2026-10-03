using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HCMUSSupportV2.Backend.Migrations
{
    /// <inheritdoc />
    public partial class LastLogin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "last_login_at",
                table: "employees",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "previous_login_at",
                table: "employees",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "last_login_at",
                table: "employees");

            migrationBuilder.DropColumn(
                name: "previous_login_at",
                table: "employees");
        }
    }
}
