# PTPA Front Desk Kiosk

A free kiosk web app for Pentecostal Temple Preparatory Academy.

## What it does
- Visitor sign-in and sign-out
- Official / agency sign-in and sign-out for DCF, counselors, social workers, district/system staff, inspectors, law enforcement, government officials, accreditation/compliance visitors, and service providers
- Parent/guardian student check-in
- Parent/guardian student check-out
- Admin dashboard for records and student roster
- CSV import/export
- Backup and restore
- Offline-ready PWA for a front desk tablet

## Default Admin PIN
2468

Change it after setup.

## Roster CSV Format
Use this header row:

StudentID,FirstName,LastName,Grade,Active

Example:

1001,John,Smith,4,true
1002,Mary,Jones,2,true

## Suggested front desk workflow
- Keep the kiosk on a tablet or touchscreen at the main office.
- Let visitors choose the Visitor Sign-In/Sign-Out tile.
- Let parents choose either Parent Student Check-In or Parent Student Check-Out.
- Office staff can access the Admin dashboard to export daily records.

## GitHub Pages
Upload the files in this folder to a GitHub repository and publish it with GitHub Pages, just like the cafeteria app.

## Privacy note
This version stores data locally on the kiosk device/browser. Use the app's backup feature regularly.

## Official / Agency kiosk
The Official / Agency option stores the official's name, agency, role, optional credential/badge ID, purpose, meeting-with field, and sign-in/sign-out timestamps. Avoid entering confidential case details in the notes field.
