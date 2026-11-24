-- Applied on 24 Nov 2026 by owner approval: images rule changed from 2-3 to 1-3.
BEGIN;
ALTER TABLE public.products DROP CONSTRAINT products_images_check;
ALTER TABLE public.products ADD CONSTRAINT products_images_check
  CHECK (images IS NOT NULL AND COALESCE(array_length(images, 1) BETWEEN 1 AND 3, false));
COMMIT;

-- ROLLBACK (only if no product has exactly 1 image, otherwise it will fail):
-- BEGIN;
-- ALTER TABLE public.products DROP CONSTRAINT products_images_check;
-- ALTER TABLE public.products ADD CONSTRAINT products_images_check
--   CHECK (((array_length(images, 1) >= 2) AND (array_length(images, 1) <= 3)));
-- COMMIT;
