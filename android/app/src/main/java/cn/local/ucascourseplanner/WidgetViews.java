package cn.local.ucascourseplanner;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.text.TextUtils;
import android.view.View;
import android.widget.RemoteViews;
import java.util.List;

/** Custom-drawn weekly grid and native, scrollable daily rows. No running WebView required. */
final class WidgetViews {
    // Same sans-serif / regular face as the Android timetable's course text.
    private static final Typeface TIMETABLE_FONT = Typeface.create("sans-serif", Typeface.NORMAL);
    static final int[] BACKGROUNDS = {0xffe0ecfa, 0xffddece4, 0xfff3e9cf, 0xfff2dee8, 0xffe6dff3, 0xffdcecef};
    static final int[] FOREGROUNDS = {0xff315e90, 0xff416e55, 0xff745f2c, 0xff8d536e, 0xff705b96, 0xff3c727b};
    static final int[] DRAWABLES = {R.drawable.widget_course_0, R.drawable.widget_course_1,
        R.drawable.widget_course_2, R.drawable.widget_course_3, R.drawable.widget_course_4, R.drawable.widget_course_5};

    static Intent openIntent(Context context) {
        return new Intent(context, MainActivity.class).setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse("ucas-schedule://widget"))
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }

    static RemoteViews build(Context context, int id, boolean weekly, WidgetSchedule schedule, Bundle options) {
        RemoteViews views = new RemoteViews(context.getPackageName(), weekly ? R.layout.widget_week : R.layout.widget_today);
        PendingIntent open = PendingIntent.getActivity(context, 100, openIntent(context), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setTextViewText(R.id.widget_title, weekly ? "本周课表" : "今日课程");
        views.setTextViewText(R.id.widget_plan, schedule.planName);
        views.setTextViewText(R.id.widget_subtitle, weekly ? schedule.weekLabel() + " · " + schedule.dates[0] + "—" + schedule.dates[6]
            : schedule.dateLabel + " · " + schedule.weekLabel());
        views.setTextViewText(R.id.widget_footer, schedule.footer(weekly));
        views.setTextViewText(R.id.widget_empty, schedule.emptyLabel(weekly));
        views.setOnClickPendingIntent(R.id.widget_header, open);
        views.setOnClickPendingIntent(R.id.widget_footer, open);
        views.setOnClickPendingIntent(R.id.widget_empty, open);
        if (weekly) {
            boolean empty = schedule.events.isEmpty();
            views.setViewVisibility(R.id.widget_grid, empty ? View.GONE : View.VISIBLE);
            views.setViewVisibility(R.id.widget_empty, empty ? View.VISIBLE : View.GONE);
            if (!empty) {
                boolean landscape = context.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
                int width = options.getInt(landscape ? AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH : AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 320);
                int height = options.getInt(landscape ? AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT : AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 400);
                views.setImageViewBitmap(R.id.widget_grid, weekBitmap(context, schedule, Math.max(250, width - 28), Math.max(190, height - 102)));
                views.setContentDescription(R.id.widget_grid, description(schedule));
            }
            views.setOnClickPendingIntent(R.id.widget_grid, open);
        } else {
            views.setEmptyView(R.id.widget_list, R.id.widget_empty);
            if (Build.VERSION.SDK_INT >= 31 && schedule.todayEvents().size() <= 100) {
                RemoteViews.RemoteCollectionItems.Builder items = new RemoteViews.RemoteCollectionItems.Builder().setViewTypeCount(1).setHasStableIds(false);
                List<WidgetSchedule.Event> events = schedule.todayEvents();
                for (int i = 0; i < events.size(); i++) items.addItem(i, row(context, schedule, events.get(i)));
                views.setRemoteAdapter(R.id.widget_list, items.build());
            } else {
                Intent service = new Intent(context, TodayWidgetService.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
                service.setData(Uri.parse("ucas-widget://today/" + id));
                views.setRemoteAdapter(R.id.widget_list, service);
            }
            // A collection template needs mutable fill-in intents; the activity is explicit.
            int mutable = Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
            PendingIntent template = PendingIntent.getActivity(context, 101, openIntent(context), PendingIntent.FLAG_UPDATE_CURRENT | mutable);
            views.setPendingIntentTemplate(R.id.widget_list, template);
        }
        return views;
    }

    static RemoteViews row(Context context, WidgetSchedule schedule, WidgetSchedule.Event event) {
        RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_course);
        row.setInt(R.id.widget_row, "setBackgroundResource", DRAWABLES[event.color]);
        row.setTextViewText(R.id.widget_start, schedule.periodTime(event.start, false));
        row.setTextViewText(R.id.widget_end, schedule.periodTime(event.end, true));
        row.setTextViewText(R.id.widget_course_name, event.name);
        row.setTextViewText(R.id.widget_room, event.room() + (event.conflict ? " · 时间冲突" : ""));
        for (int id : new int[]{R.id.widget_start, R.id.widget_end, R.id.widget_course_name, R.id.widget_room}) row.setTextColor(id, FOREGROUNDS[event.color]);
        row.setOnClickFillInIntent(R.id.widget_row, new Intent());
        return row;
    }

    static String description(WidgetSchedule schedule) {
        StringBuilder result = new StringBuilder(schedule.weekLabel());
        for (WidgetSchedule.Event e : schedule.events) result.append("；").append(WidgetSchedule.DAYS[e.day - 1])
            .append(' ').append(schedule.periodTime(e.start, false)).append('—').append(schedule.periodTime(e.end, true))
            .append(' ').append(e.name).append(' ').append(e.room());
        return result.toString();
    }

    static Bitmap weekBitmap(Context context, WidgetSchedule schedule, int width, int height) {
        // Render at screen density so small type is not enlarged from a 2x image.
        // Keep the same 5.6 MB shared-memory limit on large launchers/tablets.
        float scale = Math.min(context.getResources().getDisplayMetrics().density,
            (float) Math.sqrt(1400000d / ((double) width * height)));
        Bitmap bitmap = Bitmap.createBitmap(Math.max(1, (int) (width * scale)), Math.max(1, (int) (height * scale)), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap); canvas.scale(scale, scale);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
        paint.setTypeface(TIMETABLE_FONT);
        int secondary = context.getColor(R.color.widget_secondary), line = context.getColor(R.color.widget_line);
        float gutter = 36, header = 34, column = (width - gutter) / 7f, period = (height - header) / 13f;
        paint.setColor(line); paint.setStrokeWidth(0.6f);
        for (int p = 0; p <= 13; p++) canvas.drawLine(gutter, header + period * p, width, header + period * p, paint);
        for (int day = 0; day <= 7; day++) canvas.drawLine(gutter + column * day, header, gutter + column * day, height, paint);
        for (int day = 0; day < 7; day++) {
            float x = gutter + column * day;
            if (day + 1 == schedule.today) {
                paint.setColor(BACKGROUNDS[0]); canvas.drawRoundRect(x + 1, 0, x + column - 1, header - 3, 5, 5, paint);
            }
            paint.setColor(day + 1 == schedule.today ? FOREGROUNDS[0] : secondary);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTextSize(10); canvas.drawText(WidgetSchedule.DAYS[day], x + column / 2, 11, paint);
            paint.setTextSize(9); canvas.drawText(schedule.dates[day], x + column / 2, 25, paint);
        }
        for (int p = 1; p <= 13; p++) {
            float center = header + (p - .5f) * period;
            paint.setColor(secondary); paint.setTextAlign(Paint.Align.CENTER);
            // Each row owns a complete start/end pair; the next row is never
            // mistaken for the end of this lesson (especially across breaks).
            float labelScale = Math.min(1f, period / 30f);
            paint.setTextSize(9 * labelScale);
            canvas.drawText(String.valueOf(p), gutter / 2 - 2, center - 7 * labelScale, paint);
            paint.setTextSize(7.5f * labelScale);
            canvas.drawText(schedule.periodTime(p, false), gutter / 2 - 2, center + 3 * labelScale, paint);
            canvas.drawText(schedule.periodTime(p, true), gutter / 2 - 2, center + 12 * labelScale, paint);
        }
        for (WidgetSchedule.Event e : schedule.events) {
            float x = gutter + column * (e.day - 1) + column * e.lane / e.lanes + 1.5f;
            float y = header + (e.start - 1) * period + 1.5f;
            float w = column / e.lanes - 3, h = (e.end - e.start + 1) * period - 3;
            if (w < 3) continue;
            paint.setColor(BACKGROUNDS[e.color]); canvas.drawRoundRect(x, y, x + w, y + h, 4, 4, paint);
            if (e.conflict) {
                paint.setColor(0xffb85959); canvas.drawCircle(x + w - 3, y + 3, 1.7f, paint);
            }
            canvas.save(); canvas.clipRect(x + 2, y + 2, x + w - 2, y + h - 2);
            float font = Math.min(10.5f, Math.max(8, column / 4.5f));
            int available = Math.max(1, (int) (h - 8));
            int titleLines = Math.max(1, Math.min(4, (int) ((available - 12) / (font * 1.18f))));
            float used = drawText(canvas, e.name, x + 3, y + 4, w - 6, font, FOREGROUNDS[e.color], titleLines);
            if (available - used >= 10) drawText(canvas, e.room(), x + 3, y + 6 + used, w - 6, Math.max(7.5f, font - 1), FOREGROUNDS[e.color],
                Math.max(1, (int) ((available - used - 2) / font)));
            canvas.restore();
        }
        return bitmap;
    }

    private static float drawText(Canvas canvas, String value, float x, float y, float width, float size, int color, int lines) {
        TextPaint paint = new TextPaint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG); paint.setColor(color); paint.setTextSize(size);
        paint.setTypeface(TIMETABLE_FONT);
        StaticLayout layout = StaticLayout.Builder.obtain(value, 0, value.length(), paint, Math.max(1, (int) width))
            .setAlignment(Layout.Alignment.ALIGN_NORMAL).setIncludePad(false).setLineSpacing(1, 1)
            .setMaxLines(lines).setEllipsize(TextUtils.TruncateAt.END).build();
        canvas.save(); canvas.translate(x, y); layout.draw(canvas); canvas.restore();
        return layout.getHeight();
    }
}
