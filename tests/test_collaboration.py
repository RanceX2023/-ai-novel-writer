"""Tests for the collaboration module."""

import pytest
from datetime import datetime, timedelta
from uuid import uuid4

from src.collaboration import (
    CollaborationManager,
    User,
    Document,
)
from src.permissions import Role, Permission


@pytest.fixture
def manager():
    """Create a fresh CollaborationManager for each test."""
    return CollaborationManager()


@pytest.fixture
def users():
    """Create test users."""
    owner = User(id=uuid4(), email='owner@test.com', name='Owner')
    editor = User(id=uuid4(), email='editor@test.com', name='Editor')
    viewer = User(id=uuid4(), email='viewer@test.com', name='Viewer')
    return {'owner': owner, 'editor': editor, 'viewer': viewer}


@pytest.fixture
def document(users):
    """Create a test document."""
    return Document(
        id=uuid4(),
        title='Test Document',
        content={'text': 'Test content'},
        owner_id=users['owner'].id,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )


class TestCollaborationManagerBasics:
    """Test basic CollaborationManager functionality."""

    def test_add_user(self, manager, users):
        """Test adding a user to the manager."""
        manager.add_user(users['owner'])
        assert users['owner'].id in manager.users
        assert manager.users[users['owner'].id] == users['owner']

    def test_add_document(self, manager, document):
        """Test adding a document to the manager."""
        manager.add_document(document)
        assert document.id in manager.documents
        assert manager.documents[document.id] == document


class TestUserRoles:
    """Test user role management."""

    def test_owner_role(self, manager, users, document):
        """Test that document owner has OWNER role."""
        manager.add_user(users['owner'])
        manager.add_document(document)
        
        role = manager.get_user_role(users['owner'].id, document.id)
        assert role == Role.OWNER

    def test_no_role_for_non_member(self, manager, users, document):
        """Test that non-members have no role."""
        manager.add_user(users['editor'])
        manager.add_document(document)
        
        role = manager.get_user_role(users['editor'].id, document.id)
        assert role is None

    def test_collaborator_role(self, manager, users, document):
        """Test that collaborators have their assigned role."""
        manager.add_user(users['owner'])
        manager.add_user(users['editor'])
        manager.add_document(document)
        
        manager.add_collaborator(
            document.id,
            users['editor'].id,
            Role.EDITOR,
            users['owner'].id
        )
        
        role = manager.get_user_role(users['editor'].id, document.id)
        assert role == Role.EDITOR


class TestPermissions:
    """Test permission checking."""

    def test_owner_permissions(self, manager, users, document):
        """Test that owner has all permissions."""
        manager.add_user(users['owner'])
        manager.add_document(document)
        
        assert manager.check_permission(users['owner'].id, document.id, Permission.VIEW)
        assert manager.check_permission(users['owner'].id, document.id, Permission.EDIT)
        assert manager.check_permission(users['owner'].id, document.id, Permission.MANAGE)

    def test_editor_permissions(self, manager, users, document):
        """Test editor permissions."""
        for user in users.values():
            manager.add_user(user)
        manager.add_document(document)
        
        manager.add_collaborator(
            document.id,
            users['editor'].id,
            Role.EDITOR,
            users['owner'].id
        )
        
        assert manager.check_permission(users['editor'].id, document.id, Permission.VIEW)
        assert manager.check_permission(users['editor'].id, document.id, Permission.EDIT)
        assert not manager.check_permission(users['editor'].id, document.id, Permission.MANAGE)

    def test_viewer_permissions(self, manager, users, document):
        """Test viewer permissions."""
        for user in users.values():
            manager.add_user(user)
        manager.add_document(document)
        
        manager.add_collaborator(
            document.id,
            users['viewer'].id,
            Role.VIEWER,
            users['owner'].id
        )
        
        assert manager.check_permission(users['viewer'].id, document.id, Permission.VIEW)
        assert not manager.check_permission(users['viewer'].id, document.id, Permission.EDIT)
        assert not manager.check_permission(users['viewer'].id, document.id, Permission.MANAGE)


class TestAddCollaborator:
    """Test adding collaborators."""

    def test_add_collaborator_success(self, manager, users, document):
        """Test successfully adding a collaborator."""
        for user in users.values():
            manager.add_user(user)
        manager.add_document(document)
        
        collab = manager.add_collaborator(
            document.id,
            users['editor'].id,
            Role.EDITOR,
            users['owner'].id
        )
        
        assert collab.user_id == users['editor'].id
        assert collab.document_id == document.id
        assert collab.role == Role.EDITOR
        assert collab.added_by == users['owner'].id
        assert users['editor'].id in document.collaborators

    def test_add_collaborator_without_permission(self, manager, users, document):
        """Test that non-owners cannot add collaborators."""
        for user in users.values():
            manager.add_user(user)
        manager.add_document(document)
        
        manager.add_collaborator(
            document.id,
            users['editor'].id,
            Role.EDITOR,
            users['owner'].id
        )
        
        with pytest.raises(PermissionError):
            manager.add_collaborator(
                document.id,
                users['viewer'].id,
                Role.VIEWER,
                users['editor'].id
            )

    def test_add_owner_as_collaborator(self, manager, users, document):
        """Test that owner cannot be added as collaborator."""
        manager.add_user(users['owner'])
        manager.add_document(document)
        
        with pytest.raises(ValueError, match="Cannot add document owner"):
            manager.add_collaborator(
                document.id,
                users['owner'].id,
                Role.EDITOR,
                users['owner'].id
            )


class TestRemoveCollaborator:
    """Test removing collaborators."""

    def test_remove_collaborator_success(self, manager, users, document):
        """Test successfully removing a collaborator."""
        for user in users.values():
            manager.add_user(user)
        manager.add_document(document)
        
        manager.add_collaborator(
            document.id,
            users['editor'].id,
            Role.EDITOR,
            users['owner'].id
        )
        
        manager.remove_collaborator(
            document.id,
            users['editor'].id,
            users['owner'].id
        )
        
        assert users['editor'].id not in document.collaborators

    def test_remove_collaborator_without_permission(self, manager, users, document):
        """Test that non-owners cannot remove collaborators."""
        for user in users.values():
            manager.add_user(user)
        manager.add_document(document)
        
        manager.add_collaborator(
            document.id,
            users['editor'].id,
            Role.EDITOR,
            users['owner'].id
        )
        
        with pytest.raises(PermissionError):
            manager.remove_collaborator(
                document.id,
                users['editor'].id,
                users['viewer'].id
            )


class TestShareLinks:
    """Test share link functionality."""

    def test_create_share_link(self, manager, users, document):
        """Test creating a share link."""
        manager.add_user(users['owner'])
        manager.add_document(document)
        
        link = manager.create_share_link(
            document.id,
            users['owner'].id,
            Role.VIEWER
        )
        
        assert link.document_id == document.id
        assert link.created_by == users['owner'].id
        assert link.access_role == Role.VIEWER
        assert link.is_active
        assert link.id in document.share_links

    def test_create_share_link_with_expiration(self, manager, users, document):
        """Test creating a share link with expiration."""
        manager.add_user(users['owner'])
        manager.add_document(document)
        
        expires_at = datetime.now() + timedelta(days=7)
        link = manager.create_share_link(
            document.id,
            users['owner'].id,
            Role.VIEWER,
            expires_at
        )
        
        assert link.expires_at == expires_at

    def test_create_share_link_without_permission(self, manager, users, document):
        """Test that non-owners cannot create share links."""
        for user in users.values():
            manager.add_user(user)
        manager.add_document(document)
        
        manager.add_collaborator(
            document.id,
            users['editor'].id,
            Role.EDITOR,
            users['owner'].id
        )
        
        with pytest.raises(PermissionError):
            manager.create_share_link(
                document.id,
                users['editor'].id,
                Role.VIEWER
            )

    def test_revoke_share_link(self, manager, users, document):
        """Test revoking a share link."""
        manager.add_user(users['owner'])
        manager.add_document(document)
        
        link = manager.create_share_link(
            document.id,
            users['owner'].id,
            Role.VIEWER
        )
        
        manager.revoke_share_link(document.id, link.id, users['owner'].id)
        assert not link.is_active

    def test_access_via_share_link(self, manager, users, document):
        """Test accessing a document via share link."""
        manager.add_user(users['owner'])
        manager.add_document(document)
        
        link = manager.create_share_link(
            document.id,
            users['owner'].id,
            Role.VIEWER
        )
        
        accessed_doc, role = manager.access_via_share_link(link.id)
        assert accessed_doc.id == document.id
        assert role == Role.VIEWER
        assert link.access_count == 1

    def test_access_revoked_link(self, manager, users, document):
        """Test that accessing revoked link fails."""
        manager.add_user(users['owner'])
        manager.add_document(document)
        
        link = manager.create_share_link(
            document.id,
            users['owner'].id,
            Role.VIEWER
        )
        
        manager.revoke_share_link(document.id, link.id, users['owner'].id)
        
        with pytest.raises(ValueError, match="no longer active"):
            manager.access_via_share_link(link.id)

    def test_access_expired_link(self, manager, users, document):
        """Test that accessing expired link fails."""
        manager.add_user(users['owner'])
        manager.add_document(document)
        
        expires_at = datetime.now() - timedelta(days=1)
        link = manager.create_share_link(
            document.id,
            users['owner'].id,
            Role.VIEWER,
            expires_at
        )
        
        with pytest.raises(ValueError, match="has expired"):
            manager.access_via_share_link(link.id)


class TestListOperations:
    """Test listing collaborators and share links."""

    def test_list_collaborators(self, manager, users, document):
        """Test listing all collaborators."""
        for user in users.values():
            manager.add_user(user)
        manager.add_document(document)
        
        manager.add_collaborator(
            document.id,
            users['editor'].id,
            Role.EDITOR,
            users['owner'].id
        )
        manager.add_collaborator(
            document.id,
            users['viewer'].id,
            Role.VIEWER,
            users['owner'].id
        )
        
        collaborators = manager.list_collaborators(document.id, users['owner'].id)
        assert len(collaborators) == 2

    def test_list_share_links(self, manager, users, document):
        """Test listing all share links."""
        manager.add_user(users['owner'])
        manager.add_document(document)
        
        link1 = manager.create_share_link(document.id, users['owner'].id, Role.VIEWER)
        link2 = manager.create_share_link(document.id, users['owner'].id, Role.EDITOR)
        
        links = manager.list_share_links(document.id, users['owner'].id)
        assert len(links) == 2
