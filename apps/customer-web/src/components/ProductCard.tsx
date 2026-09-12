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
      className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex gap-4 cursor-pointer active:scale-[0.98] transition-transform hover:shadow-md"
    >
      {/* Product Image / Placeholder */}
      <div className="w-24 h-24 rounded-xl bg-slate-100 flex-shrink-0 relative overflow-hidden flex items-center justify-center">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            crossOrigin="anonymous"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-3xl">🍽️</span>
        )}
        {product.isAgeRestricted && (
          <span className="absolute top-1 left-1 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
            18+
          </span>
        )}
      </div>

      {/* Product Details */}
      <div className="flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-1">
            <h3 className="font-bold text-slate-900 text-base leading-snug">{product.name}</h3>
          </div>
          {product.description && (
            <p className="text-slate-500 text-xs mt-1 line-clamp-2 leading-relaxed">
              {product.description}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="font-extrabold text-slate-900 text-base">
            {product.price.toFixed(2)} zł
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(product);
            }}
            className="w-8 h-8 rounded-full bg-brand-500 hover:bg-brand-600 text-white flex items-center justify-center shadow-sm active:scale-90 transition-all"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
