-- Existing products remain visible under Other until assigned a category.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Other';
