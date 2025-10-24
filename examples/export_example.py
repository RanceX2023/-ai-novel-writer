#!/usr/bin/env python3
"""Example script demonstrating document export functionality."""

from src.export import DocumentExporter, ExportFormat


def main():
    """Demonstrate PDF and DOCX export."""
    exporter = DocumentExporter()
    
    content = {
        'chapters': [
            {
                'title': 'Chapter 1: The Beginning',
                'text': '''It was a dark and stormy night. The wind howled through 
                the trees, and rain pelted against the windows of the old mansion.
                
                Inside, a lone figure sat by the fireplace, reading an ancient tome. 
                The flickering flames cast dancing shadows on the walls, creating an 
                eerie atmosphere that would have unsettled even the bravest soul.'''
            },
            {
                'title': 'Chapter 2: The Discovery',
                'text': '''Morning came with surprising swiftness. The storm had passed, 
                leaving behind a world washed clean and glistening with dew.
                
                Our protagonist ventured into the library, where dusty shelves held 
                countless volumes of forgotten knowledge. There, hidden behind a false 
                panel, lay a secret that would change everything.'''
            },
            {
                'title': 'Chapter 3: The Journey Begins',
                'text': '''With newfound purpose, the journey commenced. The path ahead 
                was uncertain, fraught with danger and mystery.
                
                But there was no turning back now. Destiny had called, and it must 
                be answered. The adventure had truly begun.'''
            }
        ]
    }
    
    metadata = {
        'title': 'The Mysterious Manuscript',
        'author': 'Anonymous Writer',
        'date': '2024-01-15'
    }
    
    print("Exporting to PDF...")
    pdf_bytes = exporter.export_to_pdf(content, metadata)
    with open('output/example_novel.pdf', 'wb') as f:
        f.write(pdf_bytes)
    print(f"PDF exported successfully: {len(pdf_bytes)} bytes")
    
    print("\nExporting to DOCX...")
    docx_bytes = exporter.export_to_docx(content, metadata)
    with open('output/example_novel.docx', 'wb') as f:
        f.write(docx_bytes)
    print(f"DOCX exported successfully: {len(docx_bytes)} bytes")
    
    print("\nExport complete! Files saved to output/ directory.")


if __name__ == '__main__':
    import os
    os.makedirs('output', exist_ok=True)
    main()
