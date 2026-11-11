# ORQIX project walkthrough PDFs

- Phase I: Admin & Internal User Workflows ? 45 captured screens, 63 PDF pages.
- Phase II: Client Portal Walkthrough ? 21 captured screens, 31 PDF pages.

Generated on 4 November 2026 from the current application in an isolated in-memory documentation environment. Screenshots contain labeled sample accounts/records, not live client data. No live CPCB automation, deletion, payment or production account change was performed. Empty or provider-unconfigured screens show the current implementation honestly.

Each PDF includes a cover, workflow map, linked page directory, bookmarks, route labels, short descriptions and screenshots. Long application pages continue on additional PDF pages.

Rebuild screenshots: `npx.cmd playwright test tests/e2e/documentation-capture.spec.ts`.
Build PDFs: `python scripts/docs/build_project_guides.py` (ReportLab, Pillow, Windows Segoe UI fonts).

Application business code was not changed for this documentation task.
