import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

const supabase = env.NODE_ENV === "production"
   ? createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!)
   : null;

const localUrl = env.LOCAL_STORAGE_URL.replace(/\/$/, "");

function localObjectUrl(bucket: string, objectPath: string) {
   return `${localUrl}/${bucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
}

export const objectStorage = {
   bucketName: env.NODE_ENV === "development" ? env.LOCAL_STORAGE_BUCKET_NAME : env.SUPABASE_BUCKET_NAME!,

   publicUrl(bucket: string, objectPath: string) {
      if (!supabase) return localObjectUrl(bucket, objectPath);
      return `${env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${objectPath}`;
   },

   async upload(bucket: string, objectPath: string, content: Buffer, contentType: string) {
      try {
         if (!supabase) {
            const response = await fetch(localObjectUrl(bucket, objectPath), {
               method: "PUT",
               headers: {
                  "Content-Type": contentType,
                  "X-Storage-Token": env.LOCAL_STORAGE_TOKEN
               },
               body: new Uint8Array(content)
            });
            if (!response.ok) throw new Error(`Local storage upload failed (${response.status}): ${await response.text()}`);
            return { data: { path: objectPath }, error: null };
         }
         return await supabase.storage.from(bucket).upload(objectPath, content, {
            contentType,
            cacheControl: "3600"
         });
      } catch (error: any) {
         return { data: null, error: { message: error.message || "Storage upload failed" } };
      }
   },

   async remove(bucket: string, paths: string[]) {
      try {
         if (!supabase) {
            for (const objectPath of paths) {
               const response = await fetch(localObjectUrl(bucket, objectPath), {
                  method: "DELETE",
                  headers: { "X-Storage-Token": env.LOCAL_STORAGE_TOKEN }
               });
               if (!response.ok) throw new Error(`Local storage delete failed (${response.status}): ${await response.text()}`);
            }
            return { error: null };
         }
         return await supabase.storage.from(bucket).remove(paths);
      } catch (error: any) {
         return { error: { message: error.message || "Storage delete failed" } };
      }
   }
};
