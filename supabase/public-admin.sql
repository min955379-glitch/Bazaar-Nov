-- WARNING: Applying this makes product and product-image writes available to
-- every anonymous internet user, including direct API clients. The admin link
-- and Vercel deployment protection do not protect these database operations.
-- Apply only if the store owner accepts this risk. Existing admin policies are
-- retained; these policies add anonymous access.
BEGIN;
CREATE POLICY "anonymous_insert_products" ON public.products FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anonymous_update_products" ON public.products FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anonymous_delete_products" ON public.products FOR DELETE TO anon USING (true);
CREATE POLICY "anonymous_insert_product_images" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "anonymous_update_product_images" ON storage.objects FOR UPDATE TO anon USING (bucket_id = 'product-images') WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "anonymous_delete_product_images" ON storage.objects FOR DELETE TO anon USING (bucket_id = 'product-images');
COMMIT;
