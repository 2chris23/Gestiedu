package com.gestiedu.app;

import android.Manifest;
import android.content.Context;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * LO QUE LA ASISTENCIA POR QR NECESITA DEL TELÉFONO
 *
 * La web (`lib/asistencia-qr.ts`) no puede saber estas tres cosas bien:
 *
 *  · **Qué teléfono es** (`aparato`). El identificador de Android del
 *    teléfono para esta app (`ANDROID_ID`): sobrevive a cerrar sesión y a
 *    reinstalar. Es lo que corta «escaneo, cierro sesión, entro con la cuenta
 *    de mi amigo y escaneo otra vez». En el servidor solo se guarda su resumen.
 *  · **Dónde está, y si es de verdad** (`ubicacion`). Android marca las
 *    ubicaciones que vienen de una app de ubicaciones falsas
 *    (`isMock` / `isFromMockProvider`); el navegador no lo dice nunca. Por eso
 *    el faro de la asistencia «muerde» en la app.
 *  · **Que la pantalla no se apague** (`pantallaEncendida`) mientras el
 *    profesor deja el QR sobre la mesa.
 */
@CapacitorPlugin(
    name = "AsistenciaQr",
    permissions = {
        @Permission(
            alias = "ubicacion",
            strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }
        )
    }
)
public class AsistenciaQrPlugin extends Plugin {

    @PluginMethod
    public void aparato(PluginCall call) {
        String id = Settings.Secure.getString(getContext().getContentResolver(), Settings.Secure.ANDROID_ID);
        if (id == null || id.isEmpty()) {
            call.reject("No se pudo reconocer el teléfono", "SIN_APARATO");
            return;
        }
        String marca = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER;
        String modelo = Build.MODEL == null ? "" : Build.MODEL;
        String descripcion = modelo.toLowerCase().startsWith(marca.toLowerCase()) ? modelo : (marca + " " + modelo).trim();
        JSObject r = new JSObject();
        r.put("id", id);
        r.put("descripcion", "Android · " + descripcion);
        call.resolve(r);
    }

    @PluginMethod
    public void pantallaEncendida(PluginCall call) {
        final boolean encendida = Boolean.TRUE.equals(call.getBoolean("encendida", true));
        getActivity().runOnUiThread(() -> {
            if (encendida) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
        call.resolve();
    }

    @PluginMethod
    public void ubicacion(PluginCall call) {
        if (getPermissionState("ubicacion") != PermissionState.GRANTED) {
            requestPermissionForAlias("ubicacion", call, "trasPedirPermiso");
            return;
        }
        obtener(call);
    }

    @PermissionCallback
    private void trasPedirPermiso(PluginCall call) {
        if (getPermissionState("ubicacion") == PermissionState.GRANTED) obtener(call);
        else call.reject("Sin permiso para la ubicación", "SIN_PERMISO");
    }

    @SuppressWarnings({ "MissingPermission", "deprecation" })
    private void obtener(final PluginCall call) {
        final LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) {
            call.reject("Este teléfono no da la ubicación", "SIN_UBICACION");
            return;
        }

        final String proveedor;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && lm.hasProvider(LocationManager.FUSED_PROVIDER)) {
            proveedor = LocationManager.FUSED_PROVIDER;
        } else if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            proveedor = LocationManager.GPS_PROVIDER;
        } else if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            proveedor = LocationManager.NETWORK_PROVIDER;
        } else {
            call.reject("La ubicación del teléfono está apagada", "UBICACION_APAGADA");
            return;
        }

        final int tiempoMaximo = Math.max(2000, Math.min(20000, call.getInt("tiempoMaximo", 8000)));
        final AtomicBoolean respondido = new AtomicBoolean(false);
        final Handler principal = new Handler(Looper.getMainLooper());

        final Runnable conLaUltima = () -> {
            if (!respondido.compareAndSet(false, true)) return;
            Location ultima = null;
            for (String p : new String[] { proveedor, LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER }) {
                try {
                    Location l = lm.getLastKnownLocation(p);
                    if (l != null && (ultima == null || l.getTime() > ultima.getTime())) ultima = l;
                } catch (Exception ignorada) {
                    // Ese proveedor no existe en este teléfono.
                }
            }
            // Una de hace más de 2 minutos no dice dónde está AHORA.
            if (ultima != null && System.currentTimeMillis() - ultima.getTime() < 120000) call.resolve(aJson(ultima));
            else call.reject("No se pudo saber dónde estás", "SIN_UBICACION");
        };

        final java.util.function.Consumer<Location> alLlegar = (loc) -> {
            if (loc == null) {
                principal.post(conLaUltima);
                return;
            }
            if (respondido.compareAndSet(false, true)) call.resolve(aJson(loc));
        };

        principal.postDelayed(conLaUltima, tiempoMaximo);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            CancellationSignal cancelar = new CancellationSignal();
            principal.postDelayed(cancelar::cancel, tiempoMaximo);
            lm.getCurrentLocation(proveedor, cancelar, getContext().getMainExecutor(), alLlegar::accept);
        } else {
            lm.requestSingleUpdate(
                proveedor,
                new LocationListener() {
                    @Override
                    public void onLocationChanged(Location location) {
                        alLlegar.accept(location);
                    }

                    @Override
                    public void onStatusChanged(String provider, int status, Bundle extras) {}

                    @Override
                    public void onProviderEnabled(String provider) {}

                    @Override
                    public void onProviderDisabled(String provider) {}
                },
                Looper.getMainLooper()
            );
        }
    }

    @SuppressWarnings("deprecation")
    private static JSObject aJson(Location l) {
        JSObject r = new JSObject();
        r.put("lat", l.getLatitude());
        r.put("lng", l.getLongitude());
        if (l.hasAccuracy()) r.put("precision", (double) l.getAccuracy());
        boolean falsa = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? l.isMock() : l.isFromMockProvider();
        r.put("falsa", falsa);
        return r;
    }
}
