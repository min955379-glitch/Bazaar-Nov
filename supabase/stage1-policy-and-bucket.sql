BEGIN;
ALTER POLICY admin_insert_products ON public.products TO authenticated WITH CHECK (auth.email() = 'abdulmanan@bazaarshop.app');
ALTER POLICY admin_update_products ON public.products TO authenticated USING (auth.email() = 'abdulmanan@bazaarshop.app') WITH CHECK (auth.email() = 'abdulmanan@bazaarshop.app');
ALTER POLICY admin_delete_products ON public.products TO authenticated USING (auth.email() = 'abdulmanan@bazaarshop.app');
ALTER POLICY admin_insert_product_images ON storage.objects TO authenticated WITH CHECK (bucket_id = 'product-images' AND auth.email() = 'abdulmanan@bazaarshop.app');
ALTER POLICY admin_update_product_images ON storage.objects TO authenticated USING (bucket_id = 'product-images' AND auth.email() = 'abdulmanan@bazaarshop.app') WITH CHECK (bucket_id = 'product-images' AND auth.email() = 'abdulmanan@bazaarshop.app');
ALTER POLICY admin_delete_product_images ON storage.objects TO authenticated USING (bucket_id = 'product-images' AND auth.email() = 'abdulmanan@bazaarshop.app');
UPDATE storage.buckets SET file_size_limit = 4194304, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'] WHERE id = 'product-images';
COMMIT;
