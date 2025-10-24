# User Guide: Export and Collaboration Features

## Table of Contents

1. [Introduction](#introduction)
2. [Document Export](#document-export)
   - [Export to PDF](#export-to-pdf)
   - [Export to DOCX](#export-to-docx)
3. [Collaboration Features](#collaboration-features)
   - [Roles and Permissions](#roles-and-permissions)
   - [Adding Collaborators](#adding-collaborators)
   - [Removing Collaborators](#removing-collaborators)
4. [Sharing Controls](#sharing-controls)
   - [Creating Share Links](#creating-share-links)
   - [Managing Share Links](#managing-share-links)
   - [Accessing Documents via Share Links](#accessing-documents-via-share-links)
5. [Security and Permissions](#security-and-permissions)
6. [Best Practices](#best-practices)

## Introduction

This guide covers the export and collaboration features of the AI Novel Writer platform. These features allow you to:

- Export your documents to industry-standard formats (PDF and DOCX)
- Collaborate with other users on documents
- Share documents via secure links
- Manage permissions and access control

## Document Export

The platform supports exporting documents to PDF and DOCX formats using server-side rendering to ensure consistent output across all devices.

### Export to PDF

PDF export creates professional-quality documents with proper formatting, pagination, and metadata.

**Using the DocumentExporter:**

```python
from src.export import DocumentExporter, ExportFormat

# Initialize the exporter
exporter = DocumentExporter()

# Prepare your document content
content = {
    'text': 'Your document content here...',
    'chapters': [
        {
            'title': 'Chapter 1: The Beginning',
            'text': 'Once upon a time...'
        },
        {
            'title': 'Chapter 2: The Journey',
            'text': 'And so it began...'
        }
    ]
}

# Optional metadata
metadata = {
    'title': 'My Novel',
    'author': 'Jane Doe',
    'date': '2024-01-15'
}

# Export to PDF
pdf_bytes = exporter.export_to_pdf(content, metadata)

# Save to file
with open('my_novel.pdf', 'wb') as f:
    f.write(pdf_bytes)
```

**PDF Features:**
- Professional formatting with adjustable margins
- Title page with metadata (title, author, date)
- Chapter headings and proper text flow
- Justified text alignment for a polished look
- Server-side rendering ensures consistency

### Export to DOCX

DOCX export creates Microsoft Word-compatible documents that can be further edited.

**Using the DocumentExporter:**

```python
from src.export import DocumentExporter, ExportFormat

# Initialize the exporter
exporter = DocumentExporter()

# Prepare your document content (same format as PDF)
content = {
    'chapters': [
        {
            'title': 'Chapter 1',
            'text': 'Your chapter content...'
        }
    ]
}

metadata = {
    'title': 'My Novel',
    'author': 'Jane Doe'
}

# Export to DOCX
docx_bytes = exporter.export_to_docx(content, metadata)

# Save to file
with open('my_novel.docx', 'wb') as f:
    f.write(docx_bytes)
```

**DOCX Features:**
- Fully editable Word documents
- Preserves chapter structure with headings
- Embedded metadata (title, author, creation date)
- Compatible with Microsoft Word, Google Docs, and LibreOffice

**Using the Generic Export Method:**

```python
# Export using the generic method
pdf_bytes = exporter.export(content, ExportFormat.PDF, metadata)
docx_bytes = exporter.export(content, ExportFormat.DOCX, metadata)
```

## Collaboration Features

The collaboration system allows multiple users to work together on documents with fine-grained access control.

### Roles and Permissions

The platform uses a role-based permission system with three roles:

| Role   | VIEW | EDIT | MANAGE |
|--------|------|------|--------|
| OWNER  | ✓    | ✓    | ✓      |
| EDITOR | ✓    | ✓    | ✗      |
| VIEWER | ✓    | ✗    | ✗      |

**Permission Descriptions:**

- **VIEW**: Can view the document content
- **EDIT**: Can modify the document content
- **MANAGE**: Can add/remove collaborators, create/revoke share links

**Document Ownership:**
- Every document has exactly one owner
- The owner automatically has all permissions
- Ownership cannot be transferred (must be implemented separately if needed)

### Adding Collaborators

Only users with MANAGE permission (document owner) can add collaborators.

**Example:**

```python
from src.collaboration import CollaborationManager, User, Document
from src.permissions import Role
from uuid import uuid4
from datetime import datetime

# Initialize the collaboration manager
manager = CollaborationManager()

# Create users
owner = User(id=uuid4(), email='owner@example.com', name='Alice')
collaborator = User(id=uuid4(), email='collab@example.com', name='Bob')

manager.add_user(owner)
manager.add_user(collaborator)

# Create a document
doc = Document(
    id=uuid4(),
    title='My Novel',
    content={'text': 'Content here...'},
    owner_id=owner.id,
    created_at=datetime.now(),
    updated_at=datetime.now()
)

manager.add_document(doc)

# Add a collaborator with EDITOR role
try:
    collab = manager.add_collaborator(
        document_id=doc.id,
        user_id=collaborator.id,
        role=Role.EDITOR,
        added_by=owner.id
    )
    print(f"Added {collaborator.name} as {collab.role.value}")
except PermissionError as e:
    print(f"Permission denied: {e}")
```

### Removing Collaborators

Remove users who no longer need access to the document.

**Example:**

```python
# Remove a collaborator
try:
    manager.remove_collaborator(
        document_id=doc.id,
        user_id=collaborator.id,
        removed_by=owner.id
    )
    print(f"Removed {collaborator.name} from document")
except PermissionError as e:
    print(f"Permission denied: {e}")
```

**Listing Collaborators:**

```python
# List all collaborators (requires VIEW permission)
collaborators = manager.list_collaborators(doc.id, owner.id)
for collab in collaborators:
    print(f"User {collab.user_id}: {collab.role.value}")
```

## Sharing Controls

Share links provide a secure way to grant temporary or permanent access to documents without requiring user accounts.

### Creating Share Links

Generate shareable URLs that grant specific access levels.

**Example:**

```python
from datetime import datetime, timedelta
from src.permissions import Role

# Create a viewer share link (read-only)
share_link = manager.create_share_link(
    document_id=doc.id,
    created_by=owner.id,
    role=Role.VIEWER
)

print(f"Share link created: {share_link.id}")
print(f"Access role: {share_link.access_role.value}")

# Create an editor share link with expiration
expires_in_7_days = datetime.now() + timedelta(days=7)
editor_link = manager.create_share_link(
    document_id=doc.id,
    created_by=owner.id,
    role=Role.EDITOR,
    expires_at=expires_in_7_days
)

print(f"Editor link expires: {editor_link.expires_at}")
```

**Share Link Features:**
- Can grant VIEWER or EDITOR access (not OWNER/MANAGE)
- Optional expiration dates
- Trackable access count
- Can be revoked at any time
- Remain active until explicitly revoked or expired

### Managing Share Links

Monitor and control active share links for your documents.

**Listing Share Links:**

```python
# List all share links (requires MANAGE permission)
links = manager.list_share_links(doc.id, owner.id)
for link in links:
    status = "active" if link.is_active else "revoked"
    print(f"Link {link.id}: {link.access_role.value} ({status})")
    print(f"  Created: {link.created_at}")
    print(f"  Accessed: {link.access_count} times")
    if link.expires_at:
        print(f"  Expires: {link.expires_at}")
```

**Revoking Share Links:**

```python
# Revoke a share link
try:
    manager.revoke_share_link(
        document_id=doc.id,
        link_id=share_link.id,
        revoked_by=owner.id
    )
    print("Share link revoked successfully")
except PermissionError as e:
    print(f"Permission denied: {e}")
```

### Accessing Documents via Share Links

Users can access shared documents without being explicitly added as collaborators.

**Example:**

```python
# Access a document via share link
try:
    document, granted_role = manager.access_via_share_link(
        link_id=share_link.id,
        user_id=None  # Optional: track which user accessed
    )
    print(f"Accessed document: {document.title}")
    print(f"Granted role: {granted_role.value}")
except ValueError as e:
    print(f"Access denied: {e}")
```

**Access Validation:**
The system automatically checks:
- Link is active (not revoked)
- Link has not expired
- Link exists in the system

## Security and Permissions

The platform implements robust permission checks to ensure data security.

### Permission Check Workflow

Every operation that accesses or modifies a document goes through permission validation:

1. **User Role Determination**: System checks if user is owner or collaborator
2. **Permission Evaluation**: Role is mapped to specific permissions
3. **Action Authorization**: Operation proceeds only if permission is granted

**Manual Permission Checks:**

```python
from src.permissions import Permission

# Check if a user can view a document
can_view = manager.check_permission(user.id, doc.id, Permission.VIEW)

# Check if a user can edit a document
can_edit = manager.check_permission(user.id, doc.id, Permission.EDIT)

# Check if a user can manage collaborators
can_manage = manager.check_permission(user.id, doc.id, Permission.MANAGE)
```

### Security Best Practices

1. **Principle of Least Privilege**: Grant the minimum necessary access level
   - Use VIEWER role for read-only access
   - Reserve EDITOR for trusted collaborators
   - Only share MANAGE permission when absolutely necessary

2. **Share Link Management**:
   - Use expiration dates for temporary access
   - Regularly audit active share links
   - Revoke links that are no longer needed
   - Monitor access counts for suspicious activity

3. **Collaborator Management**:
   - Periodically review collaborator lists
   - Remove collaborators who no longer need access
   - Document why each collaborator has access

4. **Access Tracking**:
   - Monitor last_accessed timestamps
   - Review access patterns for anomalies
   - Keep audit logs of permission changes

## Best Practices

### Export Workflows

**For Final Publications:**
1. Complete all editing in the platform
2. Have collaborators review the content
3. Export to PDF for distribution
4. Keep the DOCX version for archival

**For Ongoing Editing:**
1. Export to DOCX periodically as backup
2. Share DOCX with external editors
3. Import changes back to the platform
4. Continue collaborative editing

### Collaboration Workflows

**Small Teams (2-5 people):**
- Add all team members as collaborators with appropriate roles
- Use direct collaboration instead of share links
- Regular sync meetings to discuss changes

**Large Teams or External Reviewers:**
- Use share links with VIEWER access for reviewers
- Limit EDITOR access to core team members
- Set expiration dates for review periods

**Public Sharing:**
- Use share links with VIEWER access only
- Set reasonable expiration dates
- Monitor access counts
- Revoke links if misused

### Permission Management

1. **Start Restrictive**: Begin with minimum permissions and grant more as needed
2. **Regular Audits**: Review permissions monthly or after project milestones
3. **Document Decisions**: Keep notes on why each person has access
4. **Immediate Revocation**: Remove access immediately when no longer needed
5. **Use Share Links Wisely**: Prefer direct collaborators for long-term access

### Export Optimization

**Content Structure:**
- Organize content into chapters for better document structure
- Use clear, descriptive chapter titles
- Include complete metadata for professional output

**File Management:**
- Use descriptive filenames (e.g., "novel_draft_v2_2024.pdf")
- Version your exports systematically
- Store exports in organized directories

## Troubleshooting

### Export Issues

**Problem**: Export fails with missing dependencies error
**Solution**: Install required libraries:
```bash
pip install reportlab python-docx
```

**Problem**: PDF formatting looks incorrect
**Solution**: Check content structure, ensure paragraphs are separated by double newlines

**Problem**: DOCX doesn't open in Word
**Solution**: Ensure the file was saved with .docx extension and as binary ('wb' mode)

### Permission Issues

**Problem**: Cannot add collaborator
**Solution**: Verify you have MANAGE permission on the document

**Problem**: Share link access denied
**Solution**: Check if link is active and hasn't expired

**Problem**: User cannot edit document
**Solution**: Verify user has EDITOR or OWNER role, not just VIEWER

## Conclusion

The export and collaboration features provide a comprehensive toolkit for managing documents throughout their lifecycle. By understanding roles, permissions, and best practices, you can effectively collaborate with teams while maintaining security and control over your content.

For additional support or feature requests, please contact the development team or file an issue in the project repository.
