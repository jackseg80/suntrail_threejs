package com.suntrail.threejs;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Log;

import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Réception des fichiers GPX ouverts (« Ouvrir avec ») ou partagés depuis une
 * autre application.
 *
 * Le contenu est lu côté natif puis publié vers le WebView par l'événement
 * {@code gpxImportReceived}. L'événement est retenu jusqu'à ce qu'un premier
 * écouteur JS soit posé : le démarrage à froid est donc couvert sans polling.
 */
@CapacitorPlugin(name = "GpxImport")
public class GpxImportPlugin extends Plugin {

    public static final String EVENT_RECEIVED = "gpxImportReceived";

    private static final String TAG = "GpxImportPlugin";
    private static final long MAX_BYTES = 20L * 1024L * 1024L;

    private ExecutorService executor;

    @Override
    public void load() {
        super.load();
        executor = Executors.newSingleThreadExecutor();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (executor != null) {
            executor.shutdown();
            executor = null;
        }
    }

    /**
     * Ouvre les réglages Android d'association de l'application, pour aider
     * l'utilisateur à faire de SunTrail le gestionnaire par défaut des GPX.
     */
    @PluginMethod
    public void openAppAssociationSettings(PluginCall call) {
        Context context = getContext();
        Uri packageUri = Uri.parse("package:" + context.getPackageName());
        Intent intent = new Intent();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent.setAction(Settings.ACTION_APP_OPEN_BY_DEFAULT_SETTINGS);
            intent.setData(packageUri);
        } else {
            intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(packageUri);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            try {
                Intent fallback = new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(fallback);
                call.resolve();
            } catch (ActivityNotFoundException nested) {
                call.reject("Unable to open application association settings");
            }
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (!isGpxIntent(intent)) return;

        final Uri[] uris = extractUris(intent);
        if (uris.length == 0) return;

        if (executor == null) executor = Executors.newSingleThreadExecutor();
        final Context context = getContext();
        executor.execute(() -> {
            JSONArray files = new JSONArray();
            for (Uri uri : uris) {
                files.put(readFile(context, uri));
            }
            JSObject payload = new JSObject();
            payload.put("files", files);

            // notifyListeners touche le WebView : on revient sur le thread UI.
            if (getActivity() != null) {
                getActivity().runOnUiThread(
                    () -> notifyListeners(EVENT_RECEIVED, payload, true)
                );
            } else {
                notifyListeners(EVENT_RECEIVED, payload, true);
            }
        });
    }

    private boolean isGpxIntent(@Nullable Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action)) {
            Uri data = intent.getData();
            if (data == null) return false;
            String scheme = data.getScheme();
            // Exclut le deep link OAuth (com.suntrail.threejs://).
            return scheme == null || "content".equals(scheme) || "file".equals(scheme);
        }
        return Intent.ACTION_SEND.equals(action)
            || Intent.ACTION_SEND_MULTIPLE.equals(action);
    }

    @SuppressWarnings("deprecation")
    private Uri[] extractUris(Intent intent) {
        if (Intent.ACTION_VIEW.equals(intent.getAction())) {
            Uri data = intent.getData();
            return data == null ? new Uri[0] : new Uri[] { data };
        }
        ArrayList<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> stream = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (stream != null) uris.addAll(stream);
        } else {
            Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream != null) uris.add(stream);
        }
        if (uris.isEmpty() && intent.getClipData() != null) {
            for (int i = 0; i < intent.getClipData().getItemCount(); i++) {
                Uri uri = intent.getClipData().getItemAt(i).getUri();
                if (uri != null) uris.add(uri);
            }
        }
        return uris.toArray(new Uri[0]);
    }

    private JSObject readFile(Context context, Uri uri) {
        JSObject file = new JSObject();
        file.put("name", resolveDisplayName(context, uri));
        try {
            byte[] bytes = readBytes(context, uri);
            if (bytes == null) {
                file.put("error", "read-failed");
                return file;
            }
            String xml = decode(bytes);
            if (!looksLikeGpx(xml)) {
                file.put("error", "not-gpx");
                return file;
            }
            file.put("xml", xml);
        } catch (TooLargeException error) {
            file.put("error", "too-large");
        } catch (Exception error) {
            Log.w(TAG, "Unable to read shared GPX", error);
            file.put("error", "read-failed");
        }
        return file;
    }

    private byte[] readBytes(Context context, Uri uri) throws Exception {
        ContentResolver resolver = context.getContentResolver();
        try (InputStream input = resolver.openInputStream(uri)) {
            if (input == null) return null;
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            long total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_BYTES) throw new TooLargeException();
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    /** Détecte un BOM UTF-8/UTF-16 avant un repli UTF-8. */
    private String decode(byte[] bytes) {
        if (bytes.length >= 2 && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xFE) {
            return new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16LE);
        }
        if (bytes.length >= 2 && (bytes[0] & 0xFF) == 0xFE && (bytes[1] & 0xFF) == 0xFF) {
            return new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16BE);
        }
        if (bytes.length >= 3
                && (bytes[0] & 0xFF) == 0xEF
                && (bytes[1] & 0xFF) == 0xBB
                && (bytes[2] & 0xFF) == 0xBF) {
            return new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8);
        }
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private boolean looksLikeGpx(@Nullable String xml) {
        if (xml == null) return false;
        String head = xml.length() > 8192 ? xml.substring(0, 8192) : xml;
        return head.toLowerCase(Locale.ROOT).contains("<gpx");
    }

    private String resolveDisplayName(Context context, Uri uri) {
        String name = null;
        if ("content".equals(uri.getScheme())) {
            try (Cursor cursor = context.getContentResolver().query(uri, null, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (index >= 0 && !cursor.isNull(index)) name = cursor.getString(index);
                }
            } catch (Exception ignored) {
                // Le nom de repli ci-dessous reste suffisant.
            }
        }
        if (name == null || name.trim().isEmpty()) name = uri.getLastPathSegment();
        if (name == null || name.trim().isEmpty()) name = "track.gpx";
        return name;
    }

    private static class TooLargeException extends Exception {
        TooLargeException() {
            super("Shared GPX exceeds the maximum accepted size");
        }
    }
}
