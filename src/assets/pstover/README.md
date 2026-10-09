# PStover HSW inserts and connectors

`parts.json` holds triangle meshes of these parts by **PStover**:

- `std`: PSTOV-HSW-CONNECTOR-STD, the standard snap-in insert
- `mount`: PSTOV-HSW-1X-MOUNT, the insert with a screw hole
- `bar2`: PSTOV-HSW-2X-CONN, the bridge in the 2-cell connector
- `filler3`: PSTOV-HSW-3X-FILLER2, the bridge in the 3-cell connector
- `filler4end`: PSTOV-4X-FILLER2, the bridge in the 4-cell connector with the screw at an end cell
- `filler4mid`: PSTOV-4X-FILLER3, the bridge in the 4-cell connector with the screw at a middle cell

**Licence:** [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Attribution goes to PStover. These parts may not be used commercially.

**Changes made:** the STEP assemblies were triangulated with OpenCASCADE (occt-import-js; 0.05 mm linear deflection). The meshes were then healed: vertices welded within 0.001 mm and triangles oriented consistently outward. The standard and screw inserts were centred on their cell axis. HSW Studio places and rotates these parts, and joins them into connector groups and accessory inserts. Exported files that contain them come with a `CREDITS.txt`.
