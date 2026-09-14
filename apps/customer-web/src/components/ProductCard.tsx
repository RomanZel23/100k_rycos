'use client';

import React from 'react';
import { Product } from '@rycos/shared';
import { Plus, Clock, AlertTriangle } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
}

export function ProductCard({ product, onSelect }: ProductCardProps) {
  return (
    <div
      onClick={() => onSelect(product)}
      className="bg-white rounded-2xl p-3 sm:p-4 shadow-xs sm:shadow-sm border border-slate-100 flex gap-3 sm:gap-4 cursor-pointer active:scale-[0.98] transition-transform hover:shadow-md w-full min-w-0"
    >
      {/* Product Image / Placeholder */}
      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-slate-100 shrink-0 relative overflow-hidden flex items-center justify-center">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            crossOrigin="anonymous"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-2xl sm:text-3xl">🍽️</span>
        )}
        {product.isAgeRestricted && (
          <span className="absolute top-1 left-1 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
            18+
          </span>
        )}
      </div>

      {/* Product Details */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-1">
            <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug truncate">{product.name}</h3>
          </div>
          {product.description && (
            <p className="text-slate-500 text-xs mt-1 line-clamp-2 leading-relaxed break-words">
              {product.description}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between mt-2.5 sm:mt-3">
          <span className="font-extrabold text-slate-900 text-sm sm:text-base">
            {product.price.toFixed(2)} zł
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(product);
            }}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-brand-500 hover:bg-brand-600 text-brand-text flex items-center justify-center shadow-xs active:scale-90 transition-all shrink-0"
          >
            <Plus size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
