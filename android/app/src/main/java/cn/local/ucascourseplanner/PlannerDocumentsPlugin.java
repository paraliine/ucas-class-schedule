package cn.local.ucascourseplanner;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.print.PrintAttributes;
import android.print.PrintManager;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "PlannerDocuments")
public class PlannerDocumentsPlugin extends Plugin {
    @PluginMethod
    public void saveDocument(PluginCall call) {
        String content = call.getString("content");
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (content == null || filename == null || content.length() > 4_000_000) {
            call.reject("Invalid document");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename.replaceAll("[\\\\/:*?\"<>|]", "_"));
        startActivityForResult(call, intent, "documentCreated");
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.resolve(new JSObject().put("saved", false));
            return;
        }
        Uri uri = result.getData().getData();
        getBridge().execute(() -> {
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (stream == null) throw new IllegalStateException("Document is not writable");
                stream.write(call.getString("content", "").getBytes(StandardCharsets.UTF_8));
                call.resolve(new JSObject().put("saved", true));
            } catch (Exception error) {
                call.reject("Unable to save document", error);
            }
        });
    }

    @PluginMethod
    public void printTimetable(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
            manager.print("UCAS timetable", getBridge().getWebView().createPrintDocumentAdapter("UCAS timetable"), new PrintAttributes.Builder().build());
            call.resolve();
        });
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        Uri uri = Uri.parse(call.getString("url", ""));
        if (!"https".equals(uri.getScheme())) { call.reject("Unsupported URL"); return; }
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri));
            call.resolve();
        } catch (Exception error) {
            call.reject("No browser available", error);
        }
    }
}
