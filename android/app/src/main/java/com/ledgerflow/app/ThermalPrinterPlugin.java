package com.ledgerflow.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;

/**
 * Minimal Bluetooth Classic (SPP) bridge for ESC/POS thermal printers.
 * The web layer builds the ESC/POS payload; this plugin only lists the paired
 * devices and moves raw bytes to one of them — no vendor SDK, no printer app.
 *
 * Debugging: every stage logs under the "ThermalPrinter" tag (adb logcat -s
 * ThermalPrinter), including a hex dump of the exact bytes written.
 */
@CapacitorPlugin(
    name = "ThermalPrinter",
    permissions = { @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }) }
)
public class ThermalPrinterPlugin extends Plugin {
    private static final String TAG = "ThermalPrinter";
    /** Standard Serial Port Profile UUID — what thermal printers speak. */
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    // BLUETOOTH_CONNECT exists (and is a runtime permission) only on Android 12+.
    private boolean missingPermission() {
        return Build.VERSION.SDK_INT >= 31 && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    @PluginMethod
    public void listPrinters(PluginCall call) {
        if (missingPermission()) { requestPermissionForAlias("bluetooth", call, "btPermCallback"); return; }
        doList(call);
    }

    @PluginMethod
    public void print(PluginCall call) {
        if (missingPermission()) { requestPermissionForAlias("bluetooth", call, "btPermCallback"); return; }
        doPrint(call);
    }

    /** Language-probe test page built entirely in native code — sends labelled
     *  ESC/POS, CPCL and TSPL blocks so the block that renders identifies the
     *  printer's command language. No data crosses the JS bridge. */
    @PluginMethod
    public void testPrint(PluginCall call) {
        if (missingPermission()) { requestPermissionForAlias("bluetooth", call, "btPermCallback"); return; }
        doTestPrint(call);
    }

    @PermissionCallback
    private void btPermCallback(PluginCall call) {
        if (missingPermission()) { call.reject("Bluetooth permission was denied"); return; }
        String m = call.getMethodName();
        if ("print".equals(m)) doPrint(call);
        else if ("testPrint".equals(m)) doTestPrint(call);
        else doList(call);
    }

    private void doList(PluginCall call) {
        BluetoothAdapter ad = adapter();
        if (ad == null) { call.reject("Bluetooth is not available on this device"); return; }
        if (!ad.isEnabled()) { call.reject("Bluetooth is turned off"); return; }
        JSArray devices = new JSArray();
        try {
            Set<BluetoothDevice> bonded = ad.getBondedDevices();
            for (BluetoothDevice d : bonded) {
                JSObject o = new JSObject();
                o.put("name", d.getName() == null ? d.getAddress() : d.getName());
                o.put("address", d.getAddress());
                devices.put(o);
            }
        } catch (SecurityException e) {
            call.reject("Bluetooth permission was denied");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("devices", devices);
        call.resolve(ret);
    }

    private void doPrint(PluginCall call) {
        String address = call.getString("address");
        String data = call.getString("data");
        if (address == null || data == null) { call.reject("address and data are required"); return; }
        byte[] bytes;
        // Base64 is only the JS→Java transport encoding; what goes over the
        // socket is the decoded raw ESC/POS byte array — never HTML/JSON/text.
        try { bytes = Base64.decode(data, Base64.DEFAULT); }
        catch (IllegalArgumentException e) { call.reject("data must be base64"); return; }
        send(call, address, bytes);
    }

    private void doTestPrint(PluginCall call) {
        String address = call.getString("address");
        if (address == null) { call.reject("address is required"); return; }
        send(call, address, buildLanguageProbe());
    }

    /** ESC @ + Hello World (ESC/POS), then CPCL and TSPL label blocks. On an
     *  ESC/POS printer the CPCL/TSPL commands print as literal text — that's
     *  expected and still identifies the language. */
    private byte[] buildLanguageProbe() {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        try {
            b.write(new byte[] { 0x1b, 0x40 }); // ESC @ — initialize
            b.write("* ESCPOS *\nHello World\n1234567890\n\n".getBytes(StandardCharsets.US_ASCII));
            b.write("! 0 200 200 120 1\r\nTEXT 4 0 10 30 CPCL WORKS\r\nFORM\r\nPRINT\r\n".getBytes(StandardCharsets.US_ASCII));
            b.write("SIZE 48 mm,20 mm\r\nCLS\r\nTEXT 20,20,\"3\",0,1,1,\"TSPL WORKS\"\r\nPRINT 1\r\n".getBytes(StandardCharsets.US_ASCII));
            b.write("\n\n\n".getBytes(StandardCharsets.US_ASCII));
        } catch (Exception ignored) { /* ByteArrayOutputStream can't actually throw */ }
        return b.toByteArray();
    }

    /** Write `bytes` to the printer at `address` with staged logging. */
    private void send(PluginCall call, String address, byte[] bytes) {
        BluetoothAdapter ad = adapter();
        if (ad == null) { call.reject("Bluetooth is not available on this device"); return; }
        if (!ad.isEnabled()) { call.reject("Bluetooth is turned off"); return; }

        // Socket connect blocks — never on the WebView thread.
        new Thread(() -> {
            BluetoothSocket socket = null;
            try {
                Log.i(TAG, "connecting to " + address + " (" + bytes.length + " bytes queued)");
                BluetoothDevice device = ad.getRemoteDevice(address);
                try { ad.cancelDiscovery(); } catch (SecurityException ignored) {}
                socket = connectSocket(device);
                Log.i(TAG, "socket open, connected=" + socket.isConnected());
                OutputStream out = socket.getOutputStream();
                Log.i(TAG, "output stream created");
                logHex(bytes);
                // Paced chunked writes: raster receipts are tens of KB while the
                // printer's receive buffer is a few KB — one giant write overruns
                // it (bytes drop mid-image → garbage glyphs + desync). Small
                // flushed chunks let RFCOMM flow control pace us to print speed.
                final int CHUNK = 1024;
                for (int off = 0; off < bytes.length; off += CHUNK) {
                    int n = Math.min(CHUNK, bytes.length - off);
                    out.write(bytes, off, n);
                    out.flush();
                    Thread.sleep(15);
                }
                Log.i(TAG, "wrote " + bytes.length + " bytes in paced chunks, flush complete");
                // Drain wait scales with payload so big images finish printing
                // before the link drops (close discards undelivered bytes).
                long drain = Math.min(8000, 400 + bytes.length / 8);
                Thread.sleep(drain);
                Log.i(TAG, "drain wait (" + drain + " ms) done");
                JSObject ret = new JSObject();
                ret.put("bytesWritten", bytes.length);
                call.resolve(ret);
            } catch (SecurityException e) {
                Log.e(TAG, "permission denied", e);
                call.reject("Bluetooth permission was denied");
            } catch (Exception e) {
                Log.e(TAG, "print failed", e);
                call.reject("Could not reach the printer: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
            } finally {
                if (socket != null) { try { socket.close(); } catch (Exception ignored) {} }
                Log.i(TAG, "socket closed");
            }
        }).start();
    }

    /** Hex-dump the payload head in 32-byte rows (capped — raster payloads are
     *  tens of KB and would flood logcat). */
    private void logHex(byte[] bytes) {
        int max = Math.min(bytes.length, 256);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < max; i++) {
            sb.append(String.format("%02X ", bytes[i]));
            if ((i + 1) % 32 == 0 || i == max - 1) {
                Log.d(TAG, "payload[" + (i / 32) * 32 + "]: " + sb);
                sb.setLength(0);
            }
        }
        if (bytes.length > max) Log.d(TAG, "payload: … " + (bytes.length - max) + " more bytes");
    }

    /**
     * Open an RFCOMM link, working around budget-printer firmware: the standard
     * secure SPP connect fails on many clones, so fall back to an insecure
     * socket, then to the reflection channel-1 socket every vendor print app
     * uses as a last resort.
     */
    private BluetoothSocket connectSocket(BluetoothDevice device) throws Exception {
        Exception last = null;
        try {
            BluetoothSocket s = device.createRfcommSocketToServiceRecord(SPP_UUID);
            s.connect();
            Log.i(TAG, "connected via secure SPP");
            return s;
        } catch (Exception e) { Log.w(TAG, "secure SPP connect failed: " + e.getMessage()); last = e; }
        Thread.sleep(250); // give the printer's BT stack a beat between attempts
        try {
            BluetoothSocket s = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
            s.connect();
            Log.i(TAG, "connected via insecure SPP");
            return s;
        } catch (Exception e) { Log.w(TAG, "insecure SPP connect failed: " + e.getMessage()); last = e; }
        Thread.sleep(250);
        try {
            BluetoothSocket s = (BluetoothSocket) device.getClass()
                .getMethod("createRfcommSocket", int.class).invoke(device, 1);
            s.connect();
            Log.i(TAG, "connected via reflection channel-1 socket");
            return s;
        } catch (Exception e) { Log.w(TAG, "channel-1 connect failed: " + e.getMessage()); last = e; }
        throw last;
    }
}
