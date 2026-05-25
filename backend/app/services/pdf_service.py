"""
PDF Processing Service - Handles PDF extraction, image conversion, and OCR.
"""

import io
import fitz  # PyMuPDF
from PIL import Image
from typing import List, Optional, Dict, Any
from app.core.logging_config import logger
from app.utils.text_utils import sanitize_text_for_prompt


# Set PIL image size limit to unlimited
Image.MAX_IMAGE_PIXELS = None


class PDFService:
    """Service for processing PDF files and extracting images."""
    
    def __init__(self):
        """Initialize PDF service."""
        pass
    
    def extract_images_from_pdf(
        self,
        pdf_bytes: bytes,
        page_limit: Optional[int] = None,
        page_range_start: Optional[int] = None,
        page_range_end: Optional[int] = None,
        zoom_factor: int = 2
    ) -> List[bytes]:
        """
        Extract images from PDF based on page selection.
        
        Args:
            pdf_bytes: PDF file content as bytes
            page_limit: Number of pages to process from start (if specified)
            page_range_start: Start page for range processing (1-indexed)
            page_range_end: End page for range processing (1-indexed, inclusive)
            zoom_factor: Zoom factor for image quality (default: 2)
        
        Returns:
            List of image bytes (PNG format)
        """
        images_data = []
        
        try:
            pdf_document = fitz.open(stream=pdf_bytes, filetype="pdf")
            total_pages = len(pdf_document)
            
            logger.info(f"PDF has {total_pages} pages")
            
            # Determine pages to process
            pages_to_process = self._determine_pages_to_process(
                total_pages, page_limit, page_range_start, page_range_end
            )
            
            num_pages_to_process = len(pages_to_process)
            logger.info(f"Processing {num_pages_to_process} pages")
            
            if num_pages_to_process == 0:
                logger.warning("No pages selected for processing")
                return []
            
            # Extract images from selected pages
            for page_num in pages_to_process:
                try:
                    page = pdf_document.load_page(page_num)
                    mat = fitz.Matrix(zoom_factor, zoom_factor)
                    pix = page.get_pixmap(matrix=mat)
                    
                    # Convert to PIL Image
                    img_pil = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    
                    # Save as PNG bytes
                    img_byte_arr = io.BytesIO()
                    img_pil.save(img_byte_arr, format="PNG")
                    images_data.append(img_byte_arr.getvalue())
                    
                    logger.debug(f"Successfully processed page {page_num + 1}")
                    
                except Exception as e:
                    logger.error(f"Failed to process page {page_num + 1}: {e}")
            
            pdf_document.close()
            
            logger.info(f"Successfully converted {len(images_data)} PDF pages to images")
            return images_data
            
        except Exception as e:
            logger.error(f"PDF processing failed: {e}")
            raise RuntimeError(f"Failed to process PDF: {e}")
    
    def _determine_pages_to_process(
        self,
        total_pages: int,
        page_limit: Optional[int],
        page_range_start: Optional[int],
        page_range_end: Optional[int]
    ) -> List[int]:
        """
        Determine which pages to process based on parameters.
        
        Args:
            total_pages: Total number of pages in PDF
            page_limit: Limit from start
            page_range_start: Range start (1-indexed)
            page_range_end: Range end (1-indexed, inclusive)
        
        Returns:
            List of page indices (0-indexed)
        """
        # Range has priority over limit
        if page_range_start is not None and page_range_end is not None:
            start_index = max(0, page_range_start - 1)
            end_index = min(total_pages, page_range_end)
            return list(range(start_index, end_index))
        
        # Use page limit
        if page_limit is not None:
            return list(range(min(page_limit, total_pages)))
        
        # Process all pages
        return list(range(total_pages))


def get_pdf_service() -> PDFService:
    """
    Get PDF service instance.
    
    Returns:
        PDFService instance
    """
    return PDFService()
