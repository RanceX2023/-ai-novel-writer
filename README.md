# AI Novel Writer - Export and Collaboration Tools

This repository provides the core building blocks for document export and collaboration workflows used by the **AI Novel Writer** platform. It includes:

- Server-side PDF and DOCX export pipelines powered by proven document libraries
- Role-based collaboration management with fine-grained permission checks
- Share link controls for secure external access
- Usage examples and a detailed user guide covering end-to-end workflows

---

## Features

### Document Export Pipelines
- PDF export using `reportlab` for consistent, high-quality rendering
- DOCX export using `python-docx` for Word-compatible output
- Shared content schema: supports raw text and structured chapters
- Metadata support (title, author, date, custom fields)

### Collaboration & Sharing
- Role-based access control (Owner, Editor, Viewer)
- Permission checks for view, edit, and manage actions
- Collaborator management (add/remove, list)
- Share links with optional expiration and access tracking

### Documentation & Examples
- Comprehensive [user guide](docs/user_guide.md) covering workflows
- Detailed [API reference](docs/api_reference.md) for core modules
- Example scripts demonstrating export, collaboration, and integrated usage

---

## Project Structure

```
.
├── docs/
│   └── user_guide.md           # Detailed documentation for workflows
├── examples/
│   ├── export_example.py       # Standalone export pipeline demo
│   ├── collaboration_example.py# Collaboration and permissions demo
│   └── integration_example.py  # Combined workflow example
├── src/
│   ├── __init__.py
│   ├── collaboration.py        # CollaborationManager and domain models
│   ├── export.py               # DocumentExporter with PDF/DOCX pipelines
│   └── permissions.py          # Role & permission utilities
├── data/
│   └── (runtime data storage placeholder)
├── requirements.txt            # Python dependencies
├── .gitignore
└── README.md
```

---

## Getting Started

### 1. Create a Virtual Environment (recommended)
```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

Required packages:
- `reportlab` (PDF generation)
- `python-docx` (DOCX generation)

### 3. Run the Example Workflows

Run the export pipeline demo:
```bash
python examples/export_example.py
```

Run the collaboration & permissions demo:
```bash
python examples/collaboration_example.py
```

Run the integrated workflow demo (collaboration + export):
```bash
python examples/integration_example.py
```

All scripts write generated files to an `output/` directory (created automatically).

---

## Using the Core Modules

### Document Export
```python
from src.export import DocumentExporter, ExportFormat

exporter = DocumentExporter()
document_content = {
    "chapters": [
        {"title": "Chapter 1", "text": "..."},
        {"title": "Chapter 2", "text": "..."}
    ]
}
metadata = {"title": "My Novel", "author": "Jane Doe"}

pdf_bytes = exporter.export(document_content, ExportFormat.PDF, metadata)
docx_bytes = exporter.export(document_content, ExportFormat.DOCX, metadata)
```

### Collaboration & Permissions
```python
from datetime import datetime
from uuid import uuid4

from src.collaboration import CollaborationManager, User, Document
from src.permissions import Role, Permission

manager = CollaborationManager()

owner = User(id=uuid4(), email="owner@example.com", name="Owner")
editor = User(id=uuid4(), email="editor@example.com", name="Editor")
manager.add_user(owner)
manager.add_user(editor)

document = Document(
    id=uuid4(),
    title="Collaborative Story",
    content={"text": "..."},
    owner_id=owner.id,
    created_at=datetime.utcnow(),
    updated_at=datetime.utcnow(),
)
manager.add_document(document)

manager.add_collaborator(document.id, editor.id, Role.EDITOR, owner.id)
can_edit = manager.check_permission(editor.id, document.id, Permission.EDIT)
```

Refer to the [user guide](docs/user_guide.md) for detailed workflow instructions, best practices, and troubleshooting tips.

---

## Development Notes

- All modules are dependency-free except for the export pipelines, which require `reportlab` and `python-docx`.
- Data persistence is left to the host platform; `CollaborationManager` currently operates in-memory but is designed for easy integration with external storage.
- The `data/` directory is reserved for future persistence layers (e.g., JSON stores, databases).

## Next Steps

- Integrate these modules into the wider application backend
- Implement persistent storage for collaborative data (database, object store, etc.)
- Build API endpoints or UI components that leverage the collaboration manager and export pipelines

---

## License

This project is distributed under the MIT License. Feel free to use and adapt the code for your own applications.
