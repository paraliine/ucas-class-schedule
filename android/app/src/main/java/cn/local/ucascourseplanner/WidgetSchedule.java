package cn.local.ucascourseplanner;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.TreeSet;

/** A small, durable copy of the active plan, independent of the WebView process. */
final class WidgetSchedule {
    static final String PREFS = "planner_widgets", KEY = "active_plan";
    static final long DAY = 86400000L;
    static final String[] DAYS = {"周一", "周二", "周三", "周四", "周五", "周六", "周日"};
    final List<Event> events = new ArrayList<>();
    final String planName, state, dateLabel;
    final String[] dates = new String[7];
    final int week, today, courseCount, unscheduledCount;
    final JSONArray times;

    static final class Event {
        final String id, name;
        final int day, start, end, color;
        final TreeSet<String> rooms = new TreeSet<>();
        int lane, lanes = 1;
        boolean conflict;
        Event(String id, String name, int day, int start, int end, int color) {
            this.id = id; this.name = name; this.day = day;
            this.start = start; this.end = end; this.color = color;
        }
        String room() { return rooms.isEmpty() ? "地点待定" : android.text.TextUtils.join(" / ", rooms); }
    }

    static WidgetSchedule read(Context context) {
        String json = context.getSharedPreferences(PREFS, 0).getString(KEY, "{}");
        try { return new WidgetSchedule(new JSONObject(json), new Date()); }
        catch (JSONException ignored) { return new WidgetSchedule(new JSONObject(), new Date()); }
    }

    static void save(Context context, String data) throws JSONException {
        if (data == null || data.length() > 1500000) throw new JSONException("Invalid widget snapshot");
        JSONObject json = new JSONObject(data);
        if (json.optInt("version") != 1 || json.optJSONArray("courses") == null
            || json.getJSONArray("courses").length() > 300 || json.optJSONArray("periodTimes") == null) {
            throw new JSONException("Invalid widget snapshot");
        }
        if (!context.getSharedPreferences(PREFS, 0).edit().putString(KEY, data).commit()) {
            throw new JSONException("Cannot save widget snapshot");
        }
    }

    /** Refresh existing widget selections when an APK carries a newer catalog. */
    static void refreshCatalog(Context context) throws IOException, JSONException {
        String saved = context.getSharedPreferences(PREFS, 0).getString(KEY, null);
        if (saved == null) return;
        JSONObject snapshot = new JSONObject(saved);
        JSONArray courses = snapshot.getJSONArray("courses"), updated = new JSONArray();
        for (int i = 0; i < courses.length(); i++) {
            String id = courses.getJSONObject(i).getString("id");
            if (!id.matches("[A-Za-z0-9_-]+")) continue;
            try (InputStream input = context.getAssets().open("public/data/courses/" + id + ".json")) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096]; int count;
                while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
                JSONObject course = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
                updated.put(new JSONObject().put("id", id).put("name", course.getString("name"))
                    .put("sessions", course.getJSONArray("sessions")));
            } catch (FileNotFoundException removed) { /* Removed catalog entries are discarded. */ }
        }
        save(context, snapshot.put("courses", updated).toString());
    }

    WidgetSchedule(JSONObject data, Date now) {
        planName = data.optString("planName", "国科大课表");
        times = data.optJSONArray("periodTimes") == null ? new JSONArray() : data.optJSONArray("periodTimes");
        Calendar local = Calendar.getInstance(); local.setTime(now);
        today = (local.get(Calendar.DAY_OF_WEEK) + 5) % 7 + 1;
        dateLabel = String.format(Locale.CHINA, "%d月%d日 · %s", local.get(Calendar.MONTH) + 1,
            local.get(Calendar.DAY_OF_MONTH), DAYS[today - 1]);
        long current = calendarDay(new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(now));
        long start = calendarDay(data.optString("semesterStart"));
        int max = Math.max(1, Math.min(60, data.optInt("termWeeks", 22)));
        long monday = current - (today - 1) * DAY;
        for (int d = 0; d < 7; d++) dates[d] = utcFormat("M/d", monday + d * DAY);
        if (start == Long.MIN_VALUE) { week = 1; state = "unset"; }
        else {
            Calendar utc = Calendar.getInstance(TimeZone.getTimeZone("UTC")); utc.setTimeInMillis(start);
            start -= (utc.get(Calendar.DAY_OF_WEEK) + 5) % 7 * DAY;
            int raw = (int) Math.floor((double) (current - start) / (7 * DAY)) + 1;
            week = Math.max(1, Math.min(max, raw));
            state = raw < 1 ? "before" : raw > max ? "after" : "during";
        }
        JSONArray courses = data.optJSONArray("courses");
        courseCount = courses == null ? 0 : courses.length();
        int unknown = 0;
        for (int i = 0; i < courseCount; i++) {
            JSONObject course = courses.optJSONObject(i);
            if (course == null) continue;
            JSONArray sessions = course.optJSONArray("sessions");
            boolean scheduled = false, incomplete = false;
            Map<String, Event> grouped = new LinkedHashMap<>();
            for (int j = 0; sessions != null && j < sessions.length(); j++) {
                JSONObject session = sessions.optJSONObject(j);
                if (session == null) continue;
                int day = session.optInt("day");
                TreeSet<Integer> periods = new TreeSet<>();
                JSONArray input = session.optJSONArray("periods"), weeks = session.optJSONArray("weeks");
                for (int k = 0; input != null && k < input.length(); k++) {
                    int p = input.optInt(k); if (p >= 1 && p <= 13) periods.add(p);
                }
                if (day < 1 || day > 7 || periods.isEmpty() || weeks == null || weeks.length() == 0) { incomplete = true; continue; }
                scheduled = true;
                boolean inWeek = false;
                for (int k = 0; k < weeks.length(); k++) if (weeks.optInt(k) == week) inWeek = true;
                if (!inWeek || !state.equals("during")) continue;
                List<Integer> ordered = new ArrayList<>(periods);
                for (int k = 0; k < ordered.size(); k++) {
                    int first = ordered.get(k), last = first;
                    while (k + 1 < ordered.size() && ordered.get(k + 1) == last + 1) last = ordered.get(++k);
                    String key = day + ":" + first + ":" + last;
                    Event event = grouped.get(key);
                    if (event == null) {
                        event = new Event(course.optString("id"), course.optString("name"), day, first, last, i % 6);
                        grouped.put(key, event);
                    }
                    String room = session.optString("room").trim();
                    if (!room.isEmpty()) event.rooms.add(room);
                }
            }
            if (!scheduled || incomplete) unknown++;
            events.addAll(grouped.values());
        }
        unscheduledCount = unknown;
        Collections.sort(events, Comparator.comparingInt((Event e) -> e.day)
            .thenComparingInt(e -> e.start).thenComparingInt(e -> -e.end).thenComparing(e -> e.id));
        allocateLanes();
    }

    private void allocateLanes() {
        for (int day = 1; day <= 7; day++) {
            List<Event> cluster = new ArrayList<>(); List<Integer> ends = new ArrayList<>(); int end = 0;
            for (Event event : events) {
                if (event.day != day) continue;
                if (event.start > end) { finish(cluster, ends.size()); cluster.clear(); ends.clear(); end = 0; }
                int lane = 0; while (lane < ends.size() && ends.get(lane) >= event.start) lane++;
                if (lane == ends.size()) ends.add(event.end); else ends.set(lane, event.end);
                event.lane = lane;
                for (Event other : cluster) if (!other.id.equals(event.id) && event.start <= other.end) {
                    other.conflict = event.conflict = true;
                }
                cluster.add(event); end = Math.max(end, event.end);
            }
            finish(cluster, ends.size());
        }
    }
    private static void finish(List<Event> cluster, int lanes) { for (Event e : cluster) e.lanes = lanes; }
    List<Event> todayEvents() {
        List<Event> result = new ArrayList<>();
        for (Event e : events) if (e.day == today) result.add(e);
        return result;
    }
    String periodTime(int period, boolean end) {
        JSONArray pair = times.optJSONArray(period - 1);
        return pair == null ? "" : pair.optString(end ? 1 : 0);
    }
    String weekLabel() {
        switch (state) {
            case "unset": return "请设置开学日期";
            case "before": return "尚未开学";
            case "after": return "本学期已结束";
            default: return "第 " + week + " 周";
        }
    }
    String emptyLabel(boolean weekly) {
        if (!state.equals("during")) return state.equals("unset") ? "打开 App，设置学期开始日期" : weekLabel();
        if (courseCount == 0) return "还没有课程，点击开始选课";
        if (unscheduledCount == courseCount) return "所选课程时间待定";
        return (weekly ? "本周" : "今天") + "没有课程";
    }
    String footer(boolean weekly) {
        int count = weekly ? events.size() : todayEvents().size();
        return (count == 0 ? "点击打开课表" : count + " 项安排 · 点击查看课表")
            + (unscheduledCount > 0 ? " · " + unscheduledCount + " 门时间待定" : "");
    }
    private static long calendarDay(String value) {
        if (!value.matches("\\d{4}-\\d{2}-\\d{2}")) return Long.MIN_VALUE;
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        format.setLenient(false); format.setTimeZone(TimeZone.getTimeZone("UTC"));
        Date date = format.parse(value, new ParsePosition(0));
        return date == null ? Long.MIN_VALUE : date.getTime();
    }
    private static String utcFormat(String pattern, long date) {
        SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.CHINA);
        format.setTimeZone(TimeZone.getTimeZone("UTC")); return format.format(new Date(date));
    }
}
