"""Collaboration and sharing functionality for documents."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID, uuid4

from src.permissions import Role, Permission, has_permission


@dataclass
class User:
    """Represents a user in the system."""

    id: UUID
    email: str
    name: str


@dataclass
class ShareLink:
    """Represents a shareable link for a document."""

    id: UUID
    document_id: UUID
    created_by: UUID
    created_at: datetime
    expires_at: Optional[datetime] = None
    access_role: Role = Role.VIEWER
    is_active: bool = True
    access_count: int = 0


@dataclass
class Collaborator:
    """Represents a user's access to a document."""

    user_id: UUID
    document_id: UUID
    role: Role
    added_by: UUID
    added_at: datetime
    last_accessed: Optional[datetime] = None


@dataclass
class Document:
    """Represents a document in the system."""

    id: UUID
    title: str
    content: Dict
    owner_id: UUID
    created_at: datetime
    updated_at: datetime
    metadata: Dict = field(default_factory=dict)
    collaborators: Dict[UUID, Collaborator] = field(default_factory=dict)
    share_links: Dict[UUID, ShareLink] = field(default_factory=dict)


class CollaborationManager:
    """Manages collaboration and sharing for documents."""

    def __init__(self):
        """Initialize the collaboration manager."""
        self.documents: Dict[UUID, Document] = {}
        self.users: Dict[UUID, User] = {}

    def add_user(self, user: User) -> None:
        """Add a user to the system."""
        self.users[user.id] = user

    def add_document(self, document: Document) -> None:
        """Add a document to the system."""
        self.documents[document.id] = document

    def get_user_role(self, user_id: UUID, document_id: UUID) -> Optional[Role]:
        """
        Get a user's role for a document.
        
        Args:
            user_id: The user's ID
            document_id: The document's ID
            
        Returns:
            The user's role, or None if they have no access
        """
        document = self.documents.get(document_id)
        if not document:
            return None

        if document.owner_id == user_id:
            return Role.OWNER

        collaborator = document.collaborators.get(user_id)
        if collaborator:
            return collaborator.role

        return None

    def check_permission(
        self, user_id: UUID, document_id: UUID, permission: Permission
    ) -> bool:
        """
        Check if a user has a specific permission for a document.
        
        Args:
            user_id: The user's ID
            document_id: The document's ID
            permission: The permission to check
            
        Returns:
            True if the user has the permission, False otherwise
        """
        role = self.get_user_role(user_id, document_id)
        return has_permission(role, permission)

    def add_collaborator(
        self,
        document_id: UUID,
        user_id: UUID,
        role: Role,
        added_by: UUID
    ) -> Collaborator:
        """
        Add a collaborator to a document.
        
        Args:
            document_id: The document's ID
            user_id: The user to add
            role: The role to grant
            added_by: The user adding the collaborator
            
        Returns:
            The created Collaborator object
            
        Raises:
            PermissionError: If the adding user lacks MANAGE permission
            ValueError: If the document or user doesn't exist
        """
        if not self.check_permission(added_by, document_id, Permission.MANAGE):
            raise PermissionError(
                f"User {added_by} lacks MANAGE permission for document {document_id}"
            )

        document = self.documents.get(document_id)
        if not document:
            raise ValueError(f"Document {document_id} not found")

        if user_id not in self.users:
            raise ValueError(f"User {user_id} not found")

        if user_id == document.owner_id:
            raise ValueError("Cannot add document owner as collaborator")

        collaborator = Collaborator(
            user_id=user_id,
            document_id=document_id,
            role=role,
            added_by=added_by,
            added_at=datetime.now()
        )

        document.collaborators[user_id] = collaborator
        return collaborator

    def remove_collaborator(
        self, document_id: UUID, user_id: UUID, removed_by: UUID
    ) -> None:
        """
        Remove a collaborator from a document.
        
        Args:
            document_id: The document's ID
            user_id: The user to remove
            removed_by: The user removing the collaborator
            
        Raises:
            PermissionError: If the removing user lacks MANAGE permission
            ValueError: If the document doesn't exist or user is not a collaborator
        """
        if not self.check_permission(removed_by, document_id, Permission.MANAGE):
            raise PermissionError(
                f"User {removed_by} lacks MANAGE permission for document {document_id}"
            )

        document = self.documents.get(document_id)
        if not document:
            raise ValueError(f"Document {document_id} not found")

        if user_id not in document.collaborators:
            raise ValueError(f"User {user_id} is not a collaborator on document {document_id}")

        del document.collaborators[user_id]

    def create_share_link(
        self,
        document_id: UUID,
        created_by: UUID,
        role: Role = Role.VIEWER,
        expires_at: Optional[datetime] = None
    ) -> ShareLink:
        """
        Create a shareable link for a document.
        
        Args:
            document_id: The document's ID
            created_by: The user creating the link
            role: The role to grant via the link (default: VIEWER)
            expires_at: Optional expiration datetime
            
        Returns:
            The created ShareLink object
            
        Raises:
            PermissionError: If the user lacks MANAGE permission
            ValueError: If the document doesn't exist
        """
        if not self.check_permission(created_by, document_id, Permission.MANAGE):
            raise PermissionError(
                f"User {created_by} lacks MANAGE permission for document {document_id}"
            )

        document = self.documents.get(document_id)
        if not document:
            raise ValueError(f"Document {document_id} not found")

        share_link = ShareLink(
            id=uuid4(),
            document_id=document_id,
            created_by=created_by,
            created_at=datetime.now(),
            expires_at=expires_at,
            access_role=role
        )

        document.share_links[share_link.id] = share_link
        return share_link

    def revoke_share_link(
        self, document_id: UUID, link_id: UUID, revoked_by: UUID
    ) -> None:
        """
        Revoke a share link for a document.
        
        Args:
            document_id: The document's ID
            link_id: The share link's ID
            revoked_by: The user revoking the link
            
        Raises:
            PermissionError: If the user lacks MANAGE permission
            ValueError: If the document or link doesn't exist
        """
        if not self.check_permission(revoked_by, document_id, Permission.MANAGE):
            raise PermissionError(
                f"User {revoked_by} lacks MANAGE permission for document {document_id}"
            )

        document = self.documents.get(document_id)
        if not document:
            raise ValueError(f"Document {document_id} not found")

        share_link = document.share_links.get(link_id)
        if not share_link:
            raise ValueError(f"Share link {link_id} not found for document {document_id}")

        share_link.is_active = False

    def access_via_share_link(
        self, link_id: UUID, user_id: Optional[UUID] = None
    ) -> tuple[Document, Role]:
        """
        Access a document via a share link.
        
        Args:
            link_id: The share link's ID
            user_id: Optional user ID accessing the link
            
        Returns:
            Tuple of (document, granted_role)
            
        Raises:
            ValueError: If the link doesn't exist, is inactive, or has expired
        """
        for document in self.documents.values():
            share_link = document.share_links.get(link_id)
            if share_link:
                if not share_link.is_active:
                    raise ValueError(f"Share link {link_id} is no longer active")

                if share_link.expires_at and datetime.now() > share_link.expires_at:
                    raise ValueError(f"Share link {link_id} has expired")

                share_link.access_count += 1

                if user_id and user_id in document.collaborators:
                    document.collaborators[user_id].last_accessed = datetime.now()

                return document, share_link.access_role

        raise ValueError(f"Share link {link_id} not found")

    def list_collaborators(self, document_id: UUID, user_id: UUID) -> List[Collaborator]:
        """
        List all collaborators for a document.
        
        Args:
            document_id: The document's ID
            user_id: The user requesting the list
            
        Returns:
            List of collaborators
            
        Raises:
            PermissionError: If the user lacks VIEW permission
            ValueError: If the document doesn't exist
        """
        if not self.check_permission(user_id, document_id, Permission.VIEW):
            raise PermissionError(
                f"User {user_id} lacks VIEW permission for document {document_id}"
            )

        document = self.documents.get(document_id)
        if not document:
            raise ValueError(f"Document {document_id} not found")

        return list(document.collaborators.values())

    def list_share_links(self, document_id: UUID, user_id: UUID) -> List[ShareLink]:
        """
        List all share links for a document.
        
        Args:
            document_id: The document's ID
            user_id: The user requesting the list
            
        Returns:
            List of share links
            
        Raises:
            PermissionError: If the user lacks MANAGE permission
            ValueError: If the document doesn't exist
        """
        if not self.check_permission(user_id, document_id, Permission.MANAGE):
            raise PermissionError(
                f"User {user_id} lacks MANAGE permission for document {document_id}"
            )

        document = self.documents.get(document_id)
        if not document:
            raise ValueError(f"Document {document_id} not found")

        return list(document.share_links.values())
