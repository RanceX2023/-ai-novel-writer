# API Reference

This document provides detailed API documentation for the export and collaboration modules.

---

## Export Module (`src.export`)

### Classes

#### `ExportFormat`

An enumeration of supported export formats.

**Values:**
- `PDF`: Portable Document Format
- `DOCX`: Microsoft Word Document format

**Example:**
```python
from src.export import ExportFormat

format = ExportFormat.PDF
```

---

#### `DocumentExporter`

Handles document export to various formats (PDF, DOCX).

##### Methods

###### `__init__()`

Initialize the document exporter. Validates that required dependencies are installed.

**Raises:**
- `ImportError`: If required dependencies (reportlab, python-docx) are not installed

**Example:**
```python
from src.export import DocumentExporter

exporter = DocumentExporter()
```

---

###### `export_to_pdf(content, metadata=None)`

Export document content to PDF format.

**Parameters:**
- `content` (Dict[str, Any]): Document content with structure and text
  - `text` (str, optional): Plain text content
  - `chapters` (List[Dict], optional): List of chapters, each with:
    - `title` (str): Chapter title
    - `text` (str): Chapter text content
- `metadata` (Dict[str, Any], optional): Document metadata
  - `title` (str): Document title
  - `author` (str): Document author
  - `date` (str): Publication date

**Returns:**
- `bytes`: PDF file as bytes

**Example:**
```python
content = {
    'chapters': [
        {'title': 'Chapter 1', 'text': 'Content here...'}
    ]
}
metadata = {'title': 'My Novel', 'author': 'Jane Doe', 'date': '2024-01-15'}
pdf_bytes = exporter.export_to_pdf(content, metadata)
```

---

###### `export_to_docx(content, metadata=None)`

Export document content to DOCX format.

**Parameters:**
- `content` (Dict[str, Any]): Document content (same structure as PDF export)
- `metadata` (Dict[str, Any], optional): Document metadata (same structure as PDF export)

**Returns:**
- `bytes`: DOCX file as bytes

**Example:**
```python
docx_bytes = exporter.export_to_docx(content, metadata)
```

---

###### `export(content, format, metadata=None)`

Generic export method that dispatches to the appropriate format handler.

**Parameters:**
- `content` (Dict[str, Any]): Document content
- `format` (ExportFormat): Export format (PDF or DOCX)
- `metadata` (Dict[str, Any], optional): Document metadata

**Returns:**
- `bytes`: Exported file as bytes

**Raises:**
- `ValueError`: If format is not supported

**Example:**
```python
from src.export import ExportFormat

pdf_bytes = exporter.export(content, ExportFormat.PDF, metadata)
docx_bytes = exporter.export(content, ExportFormat.DOCX, metadata)
```

---

## Permissions Module (`src.permissions`)

### Enumerations

#### `Role`

User roles in the collaboration system.

**Values:**
- `OWNER`: Document owner with full permissions
- `EDITOR`: Can view and edit documents
- `VIEWER`: Can only view documents

**Example:**
```python
from src.permissions import Role

role = Role.EDITOR
```

---

#### `Permission`

Permissions that can be granted on a document.

**Values:**
- `VIEW`: Can view document content
- `EDIT`: Can modify document content
- `MANAGE`: Can manage collaborators and share links

**Example:**
```python
from src.permissions import Permission

permission = Permission.EDIT
```

---

### Functions

#### `role_from_str(value)`

Convert a string role representation to a Role enum.

**Parameters:**
- `value` (str): Role name (case-insensitive)

**Returns:**
- `Role`: The corresponding Role enum value

**Raises:**
- `ValueError`: If the role is not supported

**Example:**
```python
from src.permissions import role_from_str

role = role_from_str('editor')  # Returns Role.EDITOR
```

---

#### `can(role, permission)`

Check if a role grants the specified permission.

**Parameters:**
- `role` (Role): The role to check
- `permission` (Permission): The permission to verify

**Returns:**
- `bool`: True if the role has the permission

**Example:**
```python
from src.permissions import can, Role, Permission

if can(Role.EDITOR, Permission.EDIT):
    print("Editors can edit documents")
```

---

#### `has_permission(role, permission)`

Determine whether a role (if any) grants a permission.

**Parameters:**
- `role` (Optional[Role]): The role to check (can be None)
- `permission` (Permission): The permission to verify

**Returns:**
- `bool`: True if the role has the permission, False if role is None

**Example:**
```python
from src.permissions import has_permission, Permission

if has_permission(user_role, Permission.VIEW):
    # Allow user to view document
    pass
```

---

## Collaboration Module (`src.collaboration`)

### Classes

#### `User`

Represents a user in the system.

**Attributes:**
- `id` (UUID): Unique user identifier
- `email` (str): User's email address
- `name` (str): User's display name

**Example:**
```python
from uuid import uuid4
from src.collaboration import User

user = User(id=uuid4(), email='user@example.com', name='John Doe')
```

---

#### `Document`

Represents a document in the system.

**Attributes:**
- `id` (UUID): Unique document identifier
- `title` (str): Document title
- `content` (Dict): Document content
- `owner_id` (UUID): ID of the document owner
- `created_at` (datetime): Creation timestamp
- `updated_at` (datetime): Last update timestamp
- `metadata` (Dict): Additional document metadata
- `collaborators` (Dict[UUID, Collaborator]): Dictionary of collaborators
- `share_links` (Dict[UUID, ShareLink]): Dictionary of share links

**Example:**
```python
from datetime import datetime
from uuid import uuid4
from src.collaboration import Document

doc = Document(
    id=uuid4(),
    title='My Novel',
    content={'text': 'Content here...'},
    owner_id=owner.id,
    created_at=datetime.now(),
    updated_at=datetime.now()
)
```

---

#### `Collaborator`

Represents a user's access to a document.

**Attributes:**
- `user_id` (UUID): ID of the collaborating user
- `document_id` (UUID): ID of the document
- `role` (Role): User's role for this document
- `added_by` (UUID): ID of the user who added this collaborator
- `added_at` (datetime): Timestamp when collaborator was added
- `last_accessed` (Optional[datetime]): Last access timestamp

---

#### `ShareLink`

Represents a shareable link for a document.

**Attributes:**
- `id` (UUID): Unique link identifier
- `document_id` (UUID): ID of the document
- `created_by` (UUID): ID of the user who created the link
- `created_at` (datetime): Creation timestamp
- `expires_at` (Optional[datetime]): Optional expiration timestamp
- `access_role` (Role): Role granted by this link
- `is_active` (bool): Whether the link is currently active
- `access_count` (int): Number of times the link has been accessed

---

#### `CollaborationManager`

Manages collaboration and sharing for documents.

##### Methods

###### `__init__()`

Initialize the collaboration manager.

**Example:**
```python
from src.collaboration import CollaborationManager

manager = CollaborationManager()
```

---

###### `add_user(user)`

Add a user to the system.

**Parameters:**
- `user` (User): The user to add

**Example:**
```python
manager.add_user(user)
```

---

###### `add_document(document)`

Add a document to the system.

**Parameters:**
- `document` (Document): The document to add

**Example:**
```python
manager.add_document(doc)
```

---

###### `get_user_role(user_id, document_id)`

Get a user's role for a document.

**Parameters:**
- `user_id` (UUID): The user's ID
- `document_id` (UUID): The document's ID

**Returns:**
- `Optional[Role]`: The user's role, or None if they have no access

**Example:**
```python
role = manager.get_user_role(user.id, doc.id)
if role == Role.OWNER:
    print("User is the document owner")
```

---

###### `check_permission(user_id, document_id, permission)`

Check if a user has a specific permission for a document.

**Parameters:**
- `user_id` (UUID): The user's ID
- `document_id` (UUID): The document's ID
- `permission` (Permission): The permission to check

**Returns:**
- `bool`: True if the user has the permission

**Example:**
```python
from src.permissions import Permission

if manager.check_permission(user.id, doc.id, Permission.EDIT):
    # Allow user to edit document
    pass
```

---

###### `add_collaborator(document_id, user_id, role, added_by)`

Add a collaborator to a document.

**Parameters:**
- `document_id` (UUID): The document's ID
- `user_id` (UUID): The user to add
- `role` (Role): The role to grant
- `added_by` (UUID): The user adding the collaborator

**Returns:**
- `Collaborator`: The created Collaborator object

**Raises:**
- `PermissionError`: If the adding user lacks MANAGE permission
- `ValueError`: If the document or user doesn't exist, or if trying to add owner

**Example:**
```python
from src.permissions import Role

collab = manager.add_collaborator(
    document_id=doc.id,
    user_id=editor.id,
    role=Role.EDITOR,
    added_by=owner.id
)
```

---

###### `remove_collaborator(document_id, user_id, removed_by)`

Remove a collaborator from a document.

**Parameters:**
- `document_id` (UUID): The document's ID
- `user_id` (UUID): The user to remove
- `removed_by` (UUID): The user removing the collaborator

**Raises:**
- `PermissionError`: If the removing user lacks MANAGE permission
- `ValueError`: If the document doesn't exist or user is not a collaborator

**Example:**
```python
manager.remove_collaborator(doc.id, editor.id, owner.id)
```

---

###### `create_share_link(document_id, created_by, role=Role.VIEWER, expires_at=None)`

Create a shareable link for a document.

**Parameters:**
- `document_id` (UUID): The document's ID
- `created_by` (UUID): The user creating the link
- `role` (Role, optional): The role to grant via the link (default: VIEWER)
- `expires_at` (Optional[datetime], optional): Optional expiration datetime

**Returns:**
- `ShareLink`: The created ShareLink object

**Raises:**
- `PermissionError`: If the user lacks MANAGE permission
- `ValueError`: If the document doesn't exist

**Example:**
```python
from datetime import datetime, timedelta
from src.permissions import Role

# Create a viewer link
link = manager.create_share_link(doc.id, owner.id)

# Create an editor link that expires in 7 days
editor_link = manager.create_share_link(
    doc.id,
    owner.id,
    role=Role.EDITOR,
    expires_at=datetime.now() + timedelta(days=7)
)
```

---

###### `revoke_share_link(document_id, link_id, revoked_by)`

Revoke a share link for a document.

**Parameters:**
- `document_id` (UUID): The document's ID
- `link_id` (UUID): The share link's ID
- `revoked_by` (UUID): The user revoking the link

**Raises:**
- `PermissionError`: If the user lacks MANAGE permission
- `ValueError`: If the document or link doesn't exist

**Example:**
```python
manager.revoke_share_link(doc.id, link.id, owner.id)
```

---

###### `access_via_share_link(link_id, user_id=None)`

Access a document via a share link.

**Parameters:**
- `link_id` (UUID): The share link's ID
- `user_id` (Optional[UUID], optional): Optional user ID accessing the link

**Returns:**
- `tuple[Document, Role]`: Tuple of (document, granted_role)

**Raises:**
- `ValueError`: If the link doesn't exist, is inactive, or has expired

**Example:**
```python
try:
    document, role = manager.access_via_share_link(link.id)
    print(f"Accessed '{document.title}' with role {role.value}")
except ValueError as e:
    print(f"Access denied: {e}")
```

---

###### `list_collaborators(document_id, user_id)`

List all collaborators for a document.

**Parameters:**
- `document_id` (UUID): The document's ID
- `user_id` (UUID): The user requesting the list

**Returns:**
- `List[Collaborator]`: List of collaborators

**Raises:**
- `PermissionError`: If the user lacks VIEW permission
- `ValueError`: If the document doesn't exist

**Example:**
```python
collaborators = manager.list_collaborators(doc.id, owner.id)
for collab in collaborators:
    user = manager.users[collab.user_id]
    print(f"{user.name}: {collab.role.value}")
```

---

###### `list_share_links(document_id, user_id)`

List all share links for a document.

**Parameters:**
- `document_id` (UUID): The document's ID
- `user_id` (UUID): The user requesting the list

**Returns:**
- `List[ShareLink]`: List of share links

**Raises:**
- `PermissionError`: If the user lacks MANAGE permission
- `ValueError`: If the document doesn't exist

**Example:**
```python
links = manager.list_share_links(doc.id, owner.id)
for link in links:
    status = "active" if link.is_active else "revoked"
    print(f"Link {link.id}: {link.access_role.value} ({status})")
```

---

## Error Handling

### Common Exceptions

#### `PermissionError`

Raised when a user attempts an operation without the required permission.

**Example:**
```python
try:
    manager.add_collaborator(doc.id, user.id, Role.EDITOR, unauthorized_user.id)
except PermissionError as e:
    print(f"Permission denied: {e}")
```

#### `ValueError`

Raised for invalid input or state issues (e.g., document not found, expired link).

**Example:**
```python
try:
    manager.access_via_share_link(invalid_link_id)
except ValueError as e:
    print(f"Invalid operation: {e}")
```

#### `ImportError`

Raised when required dependencies are missing (export module only).

**Example:**
```python
try:
    exporter = DocumentExporter()
except ImportError as e:
    print(f"Missing dependencies: {e}")
    print("Install with: pip install reportlab python-docx")
```

---

## Type Hints

All modules use Python type hints for improved IDE support and type checking. Key types:

- `UUID`: From `uuid` module
- `datetime`: From `datetime` module
- `Dict`, `List`, `Optional`, `Set`: From `typing` module
- `bytes`: Built-in Python type

---

## Thread Safety

The current implementation is **not thread-safe**. If you need to use these modules in a multi-threaded environment:

1. Use external synchronization (locks, mutexes)
2. Create separate instances per thread
3. Implement a thread-safe wrapper

For production use, consider integrating with a proper database system that handles concurrent access.
