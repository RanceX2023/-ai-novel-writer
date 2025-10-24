"""Tests for the export module."""

from __future__ import annotations

from pathlib import Path
from typing import Dict

import importlib.util
import pytest

from src.export import DocumentExporter, ExportFormat


@pytest.fixture(scope="module")
def exporter() -> DocumentExporter:
    """Provide a DocumentExporter instance if dependencies are available."""
    missing = [
        name for name in ("reportlab", "docx") if importlib.util.find_spec(name) is None
    ]
    if missing:
        pytest.skip(f"Missing export dependencies: {', '.join(missing)}")
    return DocumentExporter()


@pytest.fixture()
def sample_content() -> Dict:
    """Return sample document content."""
    return {
        "chapters": [
            {
                "title": "Chapter 1",
                "text": "Once upon a time, in a land far away..."
            },
            {
                "title": "Chapter 2",
                "text": "The adventure continued with unexpected twists."
            }
        ]
    }


@pytest.fixture()
def sample_metadata() -> Dict:
    """Return sample document metadata."""
    return {
        "title": "Sample Story",
        "author": "Test Author",
        "date": "2024-10-24"
    }


class TestExportPipelines:
    """Test the DocumentExporter pipelines."""

    def test_export_to_pdf(self, exporter: DocumentExporter, sample_content: Dict, sample_metadata: Dict, tmp_path: Path):
        """Verify PDF export produces a non-empty byte stream."""
        pdf_bytes = exporter.export_to_pdf(sample_content, sample_metadata)
        assert isinstance(pdf_bytes, (bytes, bytearray))
        assert len(pdf_bytes) > 0

        output_path = tmp_path / "sample.pdf"
        output_path.write_bytes(pdf_bytes)
        assert output_path.exists()
        assert output_path.stat().st_size == len(pdf_bytes)

    def test_export_to_docx(self, exporter: DocumentExporter, sample_content: Dict, sample_metadata: Dict, tmp_path: Path):
        """Verify DOCX export produces a non-empty byte stream."""
        docx_bytes = exporter.export_to_docx(sample_content, sample_metadata)
        assert isinstance(docx_bytes, (bytes, bytearray))
        assert len(docx_bytes) > 0

        output_path = tmp_path / "sample.docx"
        output_path.write_bytes(docx_bytes)
        assert output_path.exists()
        assert output_path.stat().st_size == len(docx_bytes)

    def test_generic_export_dispatch(self, exporter: DocumentExporter, sample_content: Dict, sample_metadata: Dict):
        """Verify export() dispatches to the correct format handler."""
        pdf_bytes = exporter.export(sample_content, ExportFormat.PDF, sample_metadata)
        docx_bytes = exporter.export(sample_content, ExportFormat.DOCX, sample_metadata)
        assert len(pdf_bytes) > 0
        assert len(docx_bytes) > 0
