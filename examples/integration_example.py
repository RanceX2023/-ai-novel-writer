#!/usr/bin/env python3
"""Example integrating export and collaboration features."""

from datetime import datetime
from uuid import uuid4

from src.collaboration import CollaborationManager, User, Document
from src.export import DocumentExporter, ExportFormat
from src.permissions import Role, Permission


def main():
    """Demonstrate integrated workflow with collaboration and export."""
    print("=== Integrated Workflow Demo ===\n")
    
    manager = CollaborationManager()
    exporter = DocumentExporter()
    
    print("Step 1: Setting up users and document...")
    author = User(id=uuid4(), email='author@example.com', name='Primary Author')
    editor = User(id=uuid4(), email='editor@example.com', name='Content Editor')
    reviewer = User(id=uuid4(), email='reviewer@example.com', name='Reviewer')
    
    manager.add_user(author)
    manager.add_user(editor)
    manager.add_user(reviewer)
    
    doc = Document(
        id=uuid4(),
        title='The Collaborative Story',
        content={
            'chapters': [
                {
                    'title': 'Prologue',
                    'text': 'In the beginning, there was an idea. An idea that would '
                           'grow into a story told by many voices, each contributing '
                           'their unique perspective to create something greater than '
                           'the sum of its parts.'
                },
                {
                    'title': 'Chapter 1: The Team Assembles',
                    'text': 'The author sat at their desk, pondering the blank page. '
                           'They knew they could not do this alone. Writers need editors, '
                           'reviewers, and collaborators to bring out the best in their work.'
                },
                {
                    'title': 'Chapter 2: Collaboration in Action',
                    'text': 'With each person playing their role, the manuscript evolved. '
                           'The editor refined the prose, the reviewer caught inconsistencies, '
                           'and the author wove it all together into a cohesive narrative.'
                }
            ]
        },
        owner_id=author.id,
        created_at=datetime.now(),
        updated_at=datetime.now(),
        metadata={
            'author': author.name,
            'date': datetime.now().strftime('%Y-%m-%d'),
            'version': '1.0'
        }
    )
    manager.add_document(doc)
    print(f"   Document created: '{doc.title}'\n")
    
    print("Step 2: Adding collaborators with appropriate roles...")
    manager.add_collaborator(doc.id, editor.id, Role.EDITOR, author.id)
    print(f"   - {editor.name} added as EDITOR")
    
    manager.add_collaborator(doc.id, reviewer.id, Role.VIEWER, author.id)
    print(f"   - {reviewer.name} added as VIEWER\n")
    
    print("Step 3: Verify permissions before export...")
    can_export = manager.check_permission(author.id, doc.id, Permission.MANAGE)
    print(f"   - Author can manage/export: {can_export}")
    
    can_editor_export = manager.check_permission(editor.id, doc.id, Permission.EDIT)
    print(f"   - Editor can edit: {can_editor_export}")
    
    can_reviewer_export = manager.check_permission(reviewer.id, doc.id, Permission.VIEW)
    print(f"   - Reviewer can view: {can_reviewer_export}\n")
    
    print("Step 4: Creating share link for external reviewers...")
    share_link = manager.create_share_link(
        document_id=doc.id,
        created_by=author.id,
        role=Role.VIEWER
    )
    print(f"   - Share link created: {share_link.id}")
    print(f"   - External users can view but not edit\n")
    
    print("Step 5: Exporting to PDF for review...")
    export_metadata = {
        'title': doc.title,
        'author': doc.metadata.get('author', 'Unknown'),
        'date': doc.metadata.get('date', datetime.now().strftime('%Y-%m-%d'))
    }
    
    pdf_bytes = exporter.export_to_pdf(doc.content, export_metadata)
    pdf_filename = f"output/{doc.title.replace(' ', '_')}_review.pdf"
    with open(pdf_filename, 'wb') as f:
        f.write(pdf_bytes)
    print(f"   - PDF exported: {pdf_filename} ({len(pdf_bytes)} bytes)\n")
    
    print("Step 6: Exporting to DOCX for editor...")
    docx_bytes = exporter.export_to_docx(doc.content, export_metadata)
    docx_filename = f"output/{doc.title.replace(' ', '_')}_edit.docx"
    with open(docx_filename, 'wb') as f:
        f.write(docx_bytes)
    print(f"   - DOCX exported: {docx_filename} ({len(docx_bytes)} bytes)\n")
    
    print("Step 7: Simulating external access via share link...")
    accessed_doc, role = manager.access_via_share_link(share_link.id)
    print(f"   - External user accessed: '{accessed_doc.title}'")
    print(f"   - Granted role: {role.value}")
    print(f"   - Access count: {share_link.access_count}\n")
    
    print("Step 8: Workflow complete - Summary...")
    print(f"   Total collaborators: {len(doc.collaborators)}")
    print(f"   Active share links: {len([l for l in doc.share_links.values() if l.is_active])}")
    print(f"   Exports generated: 2 (PDF, DOCX)")
    print(f"   Document ready for: Review and editing\n")
    
    print("=== Workflow Complete ===")
    print("\nThis demonstrates a typical collaborative writing workflow:")
    print("1. Author creates document and adds collaborators")
    print("2. Permissions are verified for each role")
    print("3. Share links enable external review")
    print("4. Documents are exported in multiple formats")
    print("5. All actions are permission-checked and auditable")


if __name__ == '__main__':
    import os
    os.makedirs('output', exist_ok=True)
    main()
