"""Tests for the permissions module."""

import pytest

from src.permissions import Role, Permission, role_from_str, can, has_permission


class TestRoleFromStr:
    """Test role_from_str function."""

    def test_valid_roles(self):
        """Test converting valid role strings."""
        assert role_from_str('owner') == Role.OWNER
        assert role_from_str('OWNER') == Role.OWNER
        assert role_from_str('editor') == Role.EDITOR
        assert role_from_str('EDITOR') == Role.EDITOR
        assert role_from_str('viewer') == Role.VIEWER
        assert role_from_str('VIEWER') == Role.VIEWER

    def test_invalid_role(self):
        """Test converting invalid role string."""
        with pytest.raises(ValueError, match="Unsupported role"):
            role_from_str('admin')


class TestCan:
    """Test can function."""

    def test_owner_permissions(self):
        """Test that owner has all permissions."""
        assert can(Role.OWNER, Permission.VIEW) is True
        assert can(Role.OWNER, Permission.EDIT) is True
        assert can(Role.OWNER, Permission.MANAGE) is True

    def test_editor_permissions(self):
        """Test that editor has view and edit but not manage."""
        assert can(Role.EDITOR, Permission.VIEW) is True
        assert can(Role.EDITOR, Permission.EDIT) is True
        assert can(Role.EDITOR, Permission.MANAGE) is False

    def test_viewer_permissions(self):
        """Test that viewer only has view permission."""
        assert can(Role.VIEWER, Permission.VIEW) is True
        assert can(Role.VIEWER, Permission.EDIT) is False
        assert can(Role.VIEWER, Permission.MANAGE) is False


class TestHasPermission:
    """Test has_permission function."""

    def test_with_valid_role(self):
        """Test permission check with valid role."""
        assert has_permission(Role.OWNER, Permission.MANAGE) is True
        assert has_permission(Role.EDITOR, Permission.EDIT) is True
        assert has_permission(Role.VIEWER, Permission.VIEW) is True

    def test_with_no_role(self):
        """Test permission check with None role."""
        assert has_permission(None, Permission.VIEW) is False
        assert has_permission(None, Permission.EDIT) is False
        assert has_permission(None, Permission.MANAGE) is False
