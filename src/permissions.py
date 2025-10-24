"""Permission handling for collaborative document service."""

from __future__ import annotations

from enum import Enum
from typing import Optional, Set


class Role(str, Enum):
    """Roles that a user can have for a document."""

    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


class Permission(str, Enum):
    """Permissions that can be granted on a document."""

    VIEW = "view"
    EDIT = "edit"
    MANAGE = "manage"


_ROLE_PERMISSIONS: dict[Role, Set[Permission]] = {
    Role.OWNER: {Permission.VIEW, Permission.EDIT, Permission.MANAGE},
    Role.EDITOR: {Permission.VIEW, Permission.EDIT},
    Role.VIEWER: {Permission.VIEW},
}


def role_from_str(value: str) -> Role:
    """Convert a string role representation to a Role enum."""

    normalized = value.lower()
    for role in Role:
        if role.value == normalized:
            return role
    raise ValueError(f"Unsupported role: {value}")


def can(role: Role, permission: Permission) -> bool:
    """Return True if a role grants the specified permission."""

    return permission in _ROLE_PERMISSIONS[role]


def has_permission(role: Optional[Role], permission: Permission) -> bool:
    """Determine whether a role (if any) grants a permission."""

    if role is None:
        return False
    return can(role, permission)
