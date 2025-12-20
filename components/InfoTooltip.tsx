import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  content: string;
}

const InfoTooltip: React.FC<InfoTooltipProps> = ({ content }) => {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});
  const [placement, setPlacement] = useState<'top' | 'bottom'>('top');

  const updatePosition = () => {
    if (!triggerRef.current) return;
    
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 256; // w-64 is 16rem = 256px
    const gap = 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // --- Vertical Positioning ---
    // Check if there is space on top (approx 150px safety margin)
    // If not, flip to bottom.
    let newPlacement: 'top' | 'bottom' = 'top';
    if (rect.top < 150) {
      newPlacement = 'bottom';
    }

    // --- Horizontal Positioning ---
    // Try to center the tooltip relative to the trigger
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    
    // Clamp to viewport edges with padding to ensure it fits on screen
    const padding = 12;
    if (left < padding) left = padding;
    if (left + tooltipWidth > viewportWidth - padding) {
      left = viewportWidth - tooltipWidth - padding;
    }

    // --- Styles Application ---
    const style: React.CSSProperties = {
      position: 'fixed',
      left: `${left}px`,
      width: `${tooltipWidth}px`,
    };

    if (newPlacement === 'top') {
      // Position above: set bottom relative to viewport height for stability
      style.bottom = `${viewportHeight - rect.top + gap}px`;
    } else {
      // Position below: set top
      style.top = `${rect.bottom + gap}px`;
    }

    // --- Arrow Positioning ---
    // The arrow should always point to the center of the trigger icon
    const triggerCenter = rect.left + rect.width / 2;
    // Calculate position relative to the tooltip's left edge
    const arrowLeft = triggerCenter - left - 6; // 6px is half of the 12px arrow width

    setTooltipStyle(style);
    setArrowStyle({ left: `${arrowLeft}px` });
    setPlacement(newPlacement);
  };

  useEffect(() => {
    if (isVisible) {
      updatePosition();
      // Recalculate on scroll or resize to keep attached
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible]);

  return (
    <>
      <div 
        ref={triggerRef}
        className="relative inline-block ml-1.5 align-middle"
        onMouseEnter={() => {
            updatePosition();
            setIsVisible(true);
        }}
        onMouseLeave={() => setIsVisible(false)}
        onClick={(e) => {
            e.stopPropagation();
            updatePosition();
            setIsVisible(!isVisible);
        }}
      >
        <Info className="w-4 h-4 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-help transition-colors" />
      </div>
      {isVisible && createPortal(
        <div 
            className="z-[9999] p-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs rounded-lg border border-slate-200 dark:border-slate-700 shadow-xl animate-in fade-in zoom-in-95 duration-200 leading-relaxed font-normal pointer-events-none"
            style={tooltipStyle}
        >
          {content}
          {/* Arrow */}
          <div 
            className={`absolute w-3 h-3 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 transform rotate-45 ${
                placement === 'top' 
                ? '-bottom-1.5 border-r border-b' 
                : '-top-1.5 border-l border-t'
            }`}
            style={arrowStyle}
          />
        </div>,
        document.body
      )}
    </>
  );
};

export default InfoTooltip;