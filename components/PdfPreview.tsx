import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, RefreshCw } from 'lucide-react';

// Configure the worker - using the same version as the main library
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs';

interface PdfPreviewProps {
  url: string;
}

const PdfPreview: React.FC<PdfPreviewProps> = ({ url }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Render task reference to cancel if needed
  const renderTaskRef = useRef<any>(null);

  // Load Document
  useEffect(() => {
    let active = true;
    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      setPageNum(1);
      setScale(1.0); // Reset scale on new file

      try {
        const loadingTask = pdfjsLib.getDocument(url);
        const doc = await loadingTask.promise;
        
        if (!active) return;
        
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err: any) {
        if (!active) return;
        console.error('Error loading PDF:', err);
        setError('Failed to load PDF document.');
        setLoading(false);
      }
    };

    if (url) {
      loadPdf();
    }

    return () => {
      active = false;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [url]);

  // Render Page
  useEffect(() => {
    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current) return;

      setRendering(true);
      
      try {
        // Cancel previous render if active
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
        }

        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (!context) return;

        // Handle High DPI
        const outputScale = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";

        const transform = outputScale !== 1 
          ? [outputScale, 0, 0, outputScale, 0, 0] 
          : undefined;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          transform: transform,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        setRendering(false);
      } catch (err: any) {
        // Ignore cancelled errors
        if (err.name !== 'RenderingCancelledException') {
          console.error('Render error:', err);
          setRendering(false);
        }
      }
    };

    renderPage();
  }, [pdfDoc, pageNum, scale]);

  // Initial fit width logic could be added, but simple 1.0 default is safe.
  // We can attempt to auto-fit width if it's the first load
  useEffect(() => {
    if (!pdfDoc || !containerRef.current || numPages === 0) return;
    
    // Only auto-fit on first load
    if (scale === 1.0) {
       pdfDoc.getPage(1).then(page => {
           if (!containerRef.current) return;
           const viewport = page.getViewport({ scale: 1.0 });
           const containerWidth = containerRef.current.clientWidth - 32; // padding
           if (containerWidth > 0 && viewport.width > containerWidth) {
               setScale(containerWidth / viewport.width);
           }
       });
    }
  }, [pdfDoc, containerRef.current?.clientWidth]);

  const changePage = (offset: number) => {
    setPageNum(prev => Math.min(Math.max(1, prev + offset), numPages));
  };
  
  const handlePageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value);
      if (!isNaN(val)) {
          // Allow typing, clamp on blur or enter
      }
  };

  const handlePageKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
          const val = parseInt(e.currentTarget.value);
          if (!isNaN(val)) {
              setPageNum(Math.min(Math.max(1, val), numPages));
          }
          e.currentTarget.blur();
      }
  };

  const changeZoom = (delta: number) => {
    setScale(prev => Math.max(0.5, Math.min(3.0, prev + delta)));
  };

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin mb-2" />
        <p className="text-xs">Loading PDF...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 text-red-500 p-4 text-center">
        <p className="text-sm font-medium mb-2">{error}</p>
        <button 
            onClick={() => window.location.reload()}
            className="text-xs flex items-center gap-1 bg-white dark:bg-slate-800 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50"
        >
            <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-100 dark:bg-slate-900 rounded-lg overflow-hidden relative group">
      
      {/* Scrollable Container for Panning */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto flex items-center justify-center p-4 relative scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 bg-slate-200/50 dark:bg-slate-950/50"
      >
        <canvas ref={canvasRef} className="shadow-lg bg-white" />
        {rendering && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-[1px] z-10">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        )}
      </div>

      {/* Controls Bar */}
      <div className="h-14 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 shrink-0 z-20 shadow-sm">
        
        {/* Page Nav */}
        <div className="flex items-center gap-2 md:gap-3">
          <button 
            onClick={() => changePage(-1)} 
            disabled={pageNum <= 1 || rendering}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Previous Page"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
             <span className="hidden xs:inline text-slate-500 dark:text-slate-400">Page</span>
             <input 
                type="number"
                min={1}
                max={numPages}
                defaultValue={pageNum}
                key={pageNum} // Force re-render on page change to update default value
                onKeyDown={handlePageKeyDown}
                onBlur={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) setPageNum(Math.min(Math.max(1, val), numPages));
                }}
                className="w-12 h-8 text-center bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
             />
             <span className="text-slate-500 dark:text-slate-400">of {numPages}</span>
          </div>
          
          <button 
            onClick={() => changePage(1)} 
            disabled={pageNum >= numPages || rendering}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Next Page"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 md:gap-2">
          <button 
            onClick={() => changeZoom(-0.1)}
            disabled={rendering}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 w-10 text-center hidden sm:block">
            {Math.round(scale * 100)}%
          </span>
          
          <button 
            onClick={() => changeZoom(0.1)}
            disabled={rendering}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};

export default PdfPreview;
