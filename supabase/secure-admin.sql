-- Only the designated authenticated administrator may change catalog data.
BEGIN;
DROP POLICY IF EXISTS anonymous_insert_products ON public.products;
DROP POLICY IF EXISTS anonymous_update_products ON public.products;
DROP POLICY IF EXISTS anonymous_delete_products ON public.products;
DROP POLICY IF EXISTS anonymous_insert_product_images ON storage.objects;
DROP POLICY IF EXISTS anonymous_update_product_images ON storage.objects;
DROP POLICY IF EXISTS anonymous_delete_product_images ON storage.objects;
ALTER POLICY admin_insert_products ON public.products TO authenticated WITH CHECK (auth.email() = 'abdulmanan@bazaarshop.app');
ALTER POLICY admin_update_products ON public.products TO authenticated USING (auth.email() = 'abdulmanan@bazaarshop.app') WITH CHECK (auth.email() = 'abdulmanan@bazaarshop.app');
ALTER POLICY admin_delete_products ON public.products TO authenticated USING (auth.email() = 'abdulmanan@bazaarshop.app');
ALTER POLICY admin_insert_product_images ON storage.objects TO authenticated WITH CHECK (bucket_id = 'product-images' AND auth.email() = 'abdulmanan@bazaarshop.app');
ALTER POLICY admin_update_product_images ON storage.objects TO authenticated USING (bucket_id = 'product-images' AND auth.email() = 'abdulmanan@bazaarshop.app') WITH CHECK (bucket_id = 'product-images' AND auth.email() = 'abdulmanan@bazaarshop.app');
ALTER POLICY admin_delete_product_images ON storage.objects TO authenticated USING (bucket_id = 'product-images' AND auth.email() = 'abdulmanan@bazaarshop.app');
COMMIT;
