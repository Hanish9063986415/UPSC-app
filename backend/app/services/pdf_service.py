"""
PDF Processing Service — parallel page rendering with bounded memory.
Target: 80 pages processed in under 3 minutes on Standard (2 GB) instances.
"""

import asyncio
import io
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Generator, List, Optional, Tuple

import fitz  # PyMuPDF
from PIL import Image

from app.config.settings import get_settings
from app.core.logging_config import logger
from app.core.memory_utils import release_memory

_pdf_render_executor: Optional[ThreadPoolExecutor] = None


def _configure_pil_limits() -> None:
    settings = get_settings()
    if settings.image_max_pixels is not None:
        Image.MAX_IMAGE_PIXELS = settings.image_max_pixels


_configure_pil_limits()


def _get_pdf_render_executor() -> ThreadPoolExecutor:
    global _pdf_render_executor
    if _pdf_render_executor is None:
        settings = get_settings()
        _pdf_render_executor = ThreadPoolExecutor(
            max_workers=settings.pdf_render_workers,
            thread_name_prefix="pdf-render",
        )
        logger.info(f"PDF render pool: {settings.pdf_render_workers} workers")
    return _pdf_render_executor


class PDFService:
    """Service for processing PDF files and extracting page images."""

    @staticmethod
    def _render_page_from_bytes(
        pdf_bytes: bytes,
        page_index: int,
        zoom_factor: int,
        image_format: str,
        jpeg_quality: int,
    ) -> Tuple[int, bytes]:
        """Render a single page (thread-safe: opens its own document handle)."""
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        try:
            page = doc.load_page(page_index)
            mat = fitz.Matrix(zoom_factor, zoom_factor)
            pix = page.get_pixmap(matrix=mat)
            img_pil = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            buf = io.BytesIO()
            if image_format.upper() == "JPEG":
                img_pil.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
            else:
                img_pil.save(buf, format="PNG", optimize=True)
            return page_index + 1, buf.getvalue()
        finally:
            doc.close()

    def resolve_page_indices(
        self,
        pdf_bytes: bytes,
        page_limit: Optional[int] = None,
        page_range_start: Optional[int] = None,
        page_range_end: Optional[int] = None,
    ) -> List[int]:
        """Return 0-based page indices to process without rendering."""
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        try:
            total_pages = len(doc)
            return self._determine_pages_to_process(
                total_pages, page_limit, page_range_start, page_range_end
            )
        finally:
            doc.close()

    async def render_pages_parallel_async(
        self,
        pdf_bytes: bytes,
        page_indices: List[int],
        zoom_factor: int = 2,
    ) -> List[Tuple[int, bytes]]:
        """Render multiple pages in parallel (CPU-bound thread pool)."""
        if not page_indices:
            return []

        settings = get_settings()
        loop = asyncio.get_running_loop()
        executor = _get_pdf_render_executor()
        render = partial(
            PDFService._render_page_from_bytes,
            pdf_bytes,
            zoom_factor=zoom_factor,
            image_format=settings.page_image_format,
            jpeg_quality=settings.page_image_jpeg_quality,
        )

        tasks = [
            loop.run_in_executor(executor, render, page_index)
            for page_index in page_indices
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        rendered: List[Tuple[int, bytes]] = []
        for page_index, result in zip(page_indices, results):
            if isinstance(result, Exception):
                logger.error(f"Render failed for page {page_index + 1}: {result}")
            else:
                rendered.append(result)

        rendered.sort(key=lambda item: item[0])
        return rendered

    def iter_page_images(
        self,
        pdf_bytes: bytes,
        page_limit: Optional[int] = None,
        page_range_start: Optional[int] = None,
        page_range_end: Optional[int] = None,
        zoom_factor: int = 2,
    ) -> Generator[Tuple[int, bytes], None, None]:
        """Yield one page at a time (low-memory fallback path)."""
        settings = get_settings()
        page_indices = self.resolve_page_indices(
            pdf_bytes, page_limit, page_range_start, page_range_end
        )
        for page_index in page_indices:
            try:
                yield PDFService._render_page_from_bytes(
                    pdf_bytes,
                    page_index,
                    zoom_factor,
                    settings.page_image_format,
                    settings.page_image_jpeg_quality,
                )
            except Exception as e:
                logger.error(f"Failed to process page {page_index + 1}: {e}")

    def extract_images_from_pdf(
        self,
        pdf_bytes: bytes,
        page_limit: Optional[int] = None,
        page_range_start: Optional[int] = None,
        page_range_end: Optional[int] = None,
        zoom_factor: int = 2,
    ) -> List[bytes]:
        """Legacy: extract all page images (prefer parallel batch path in QA service)."""
        return [
            image_bytes
            for _, image_bytes in self.iter_page_images(
                pdf_bytes=pdf_bytes,
                page_limit=page_limit,
                page_range_start=page_range_start,
                page_range_end=page_range_end,
                zoom_factor=zoom_factor,
            )
        ]

    def _determine_pages_to_process(
        self,
        total_pages: int,
        page_limit: Optional[int],
        page_range_start: Optional[int],
        page_range_end: Optional[int],
    ) -> List[int]:
        if page_range_start is not None and page_range_end is not None:
            start_index = max(0, page_range_start - 1)
            end_index = min(total_pages, page_range_end)
            return list(range(start_index, end_index))

        if page_limit is not None:
            return list(range(min(page_limit, total_pages)))

        return list(range(total_pages))


def get_pdf_service() -> PDFService:
    return PDFService()
