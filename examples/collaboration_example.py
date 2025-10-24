#!/usr/bin/env python3
"""Example script demonstrating collaboration features."""

from datetime import datetime, timedelta
from uuid import uuid4

from src.collaboration import CollaborationManager, User, Document
from src.permissions import Role, Permission


def main():
    """Demonstrate collaboration and sharing functionality."""
    manager = CollaborationManager()
    
    print("=== Collaboration System Demo ===\n")
    
    print("1. Creating users...")
    alice = User(id=uuid4(), email='alice@example.com', name='Alice (Owner)')
    bob = User(id=uuid4(), email='bob@example.com', name='Bob (Editor)')
    charlie = User(id=uuid4(), email='charlie@example.com', name='Charlie (Viewer)')
    
    manager.add_user(alice)
    manager.add_user(bob)
    manager.add_user(charlie)
    print(f"   - Created {alice.name}")
    print(f"   - Created {bob.name}")
    print(f"   - Created {charlie.name}\n")
    
    print("2. Creating a document...")
    doc = Document(
        id=uuid4(),
        title='Collaborative Novel Project',
        content={
            'text': 'This is a collaborative writing project.',
            'chapters': [
                {'title': 'Chapter 1', 'text': 'The story begins...'}
            ]
        },
        owner_id=alice.id,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    manager.add_document(doc)
    print(f"   - Document '{doc.title}' created by {alice.name}\n")
    
    print("3. Checking initial permissions...")
    print(f"   - Alice can VIEW: {manager.check_permission(alice.id, doc.id, Permission.VIEW)}")
    print(f"   - Alice can EDIT: {manager.check_permission(alice.id, doc.id, Permission.EDIT)}")
    print(f"   - Alice can MANAGE: {manager.check_permission(alice.id, doc.id, Permission.MANAGE)}")
    print(f"   - Bob can VIEW: {manager.check_permission(bob.id, doc.id, Permission.VIEW)}")
    print()
    
    print("4. Adding collaborators...")
    collab_bob = manager.add_collaborator(
        document_id=doc.id,
        user_id=bob.id,
        role=Role.EDITOR,
        added_by=alice.id
    )
    print(f"   - Added {bob.name} as EDITOR")
    
    collab_charlie = manager.add_collaborator(
        document_id=doc.id,
        user_id=charlie.id,
        role=Role.VIEWER,
        added_by=alice.id
    )
    print(f"   - Added {charlie.name} as VIEWER\n")
    
    print("5. Checking updated permissions...")
    print(f"   - Bob can VIEW: {manager.check_permission(bob.id, doc.id, Permission.VIEW)}")
    print(f"   - Bob can EDIT: {manager.check_permission(bob.id, doc.id, Permission.EDIT)}")
    print(f"   - Bob can MANAGE: {manager.check_permission(bob.id, doc.id, Permission.MANAGE)}")
    print(f"   - Charlie can VIEW: {manager.check_permission(charlie.id, doc.id, Permission.VIEW)}")
    print(f"   - Charlie can EDIT: {manager.check_permission(charlie.id, doc.id, Permission.EDIT)}\n")
    
    print("6. Listing collaborators...")
    collaborators = manager.list_collaborators(doc.id, alice.id)
    for collab in collaborators:
        user = manager.users[collab.user_id]
        print(f"   - {user.name}: {collab.role.value}")
    print()
    
    print("7. Creating share links...")
    viewer_link = manager.create_share_link(
        document_id=doc.id,
        created_by=alice.id,
        role=Role.VIEWER
    )
    print(f"   - Created viewer link: {viewer_link.id}")
    
    expires_soon = datetime.now() + timedelta(days=7)
    editor_link = manager.create_share_link(
        document_id=doc.id,
        created_by=alice.id,
        role=Role.EDITOR,
        expires_at=expires_soon
    )
    print(f"   - Created editor link (expires in 7 days): {editor_link.id}\n")
    
    print("8. Accessing via share link...")
    accessed_doc, granted_role = manager.access_via_share_link(viewer_link.id)
    print(f"   - Accessed '{accessed_doc.title}' with role: {granted_role.value}")
    print(f"   - Link access count: {viewer_link.access_count}\n")
    
    print("9. Listing share links...")
    links = manager.list_share_links(doc.id, alice.id)
    for link in links:
        status = "active" if link.is_active else "revoked"
        expiry = f", expires {link.expires_at}" if link.expires_at else ""
        print(f"   - {link.id}: {link.access_role.value} ({status}{expiry})")
        print(f"     Accessed {link.access_count} times")
    print()
    
    print("10. Revoking a share link...")
    manager.revoke_share_link(doc.id, editor_link.id, alice.id)
    print(f"   - Revoked editor link: {editor_link.id}")
    print(f"   - Link is now active: {editor_link.is_active}\n")
    
    print("11. Attempting to access revoked link...")
    try:
        manager.access_via_share_link(editor_link.id)
        print("   - ERROR: Should have failed!")
    except ValueError as e:
        print(f"   - Access denied (expected): {e}\n")
    
    print("12. Testing permission enforcement...")
    try:
        manager.add_collaborator(
            document_id=doc.id,
            user_id=alice.id,
            role=Role.VIEWER,
            added_by=bob.id
        )
        print("   - ERROR: Bob should not have MANAGE permission!")
    except PermissionError as e:
        print(f"   - Permission check worked (expected): Bob cannot add collaborators\n")
    
    print("13. Removing a collaborator...")
    manager.remove_collaborator(doc.id, charlie.id, alice.id)
    print(f"   - Removed {charlie.name} from document")
    print(f"   - Charlie can now VIEW: {manager.check_permission(charlie.id, doc.id, Permission.VIEW)}\n")
    
    print("=== Demo Complete ===")


if __name__ == '__main__':
    main()
