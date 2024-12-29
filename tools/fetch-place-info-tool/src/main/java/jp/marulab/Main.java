package jp.marulab;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.opencsv.bean.CsvBindByName;
import com.opencsv.bean.HeaderColumnNameMappingStrategy;
import com.opencsv.bean.StatefulBeanToCsvBuilder;
import org.apache.commons.collections4.comparators.FixedOrderComparator;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;

import java.io.FileWriter;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.CompletableFuture;

public class Main {
    private static final Gson gson = new GsonBuilder().create();

    public static void main(String[] args) throws Exception {
        var props = new Properties();
        var envFile = Paths.get("./.env");
        try (var in = Files.newInputStream(envFile)) {
            props.load(in);
        }
        var apiKey = props.getProperty("API_KEY");

        var urlFile = Paths.get("./url.txt");
        List<CompletableFuture<Restaurant>> list = new ArrayList<>();
        for (String url : Files.readAllLines(urlFile)) {
            if (url.isEmpty()) {
                continue;
            }

            var future = CompletableFuture.supplyAsync(() -> {
                try {
                    String query = extractRestaurantNameAndAddress(url);
                    if (query == null) {
                        throw new Exception("Could not found name and address.url=\"" + url + "\"");
                    }
                    return fetchRestaurantInfo(apiKey, query);
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            });
            list.add(future);
        }

        try (var w = new FileWriter("output.csv")) {
            var mappingStrategy = new HeaderColumnNameMappingStrategy<Restaurant>();
            mappingStrategy.setType(Restaurant.class);
            mappingStrategy.setColumnOrderOnWrite(new FixedOrderComparator<>("GOOGLE_PLACE_ID", "NAME", "POSTAL_CODE", "ADDRESS", "LAT", "LNG", "ERROR"));
            var beanToCsv = new StatefulBeanToCsvBuilder<Restaurant>(w).withMappingStrategy(mappingStrategy).build();
            var l = list.stream().map(x -> {
                try {
                    return x.get();
                } catch (Exception e) {
                    return new Restaurant(null, null, null, null, 0, 0, e.getMessage());
                }
            }).toList();
            beanToCsv.write(l);
        }
    }

    public static String extractRestaurantNameAndAddress(String url) throws IOException {
        var doc = Jsoup.connect(url).get();
        var metas = doc.select("meta");
        for (Element meta : metas) {
            var a = meta.attribute("content");
            if (a == null) {
                continue;
            }
            var v = a.getValue();
            if (v.contains("〒")) {
                return v;
            }
        }
        return null;
    }

    public static Restaurant fetchRestaurantInfo(String apiKey, String query) {
        try {
            var client = HttpClient.newHttpClient();
            // https://developers.google.com/maps/documentation/places/web-service/text-search?hl=ja
            var res = client.send(HttpRequest.newBuilder()
                    .uri(URI.create("https://places.googleapis.com/v1/places:searchText"))
                    .header("Content-Type", "application/json")
                    .header("X-Goog-Api-Key", apiKey)
                    .header("X-Goog-FieldMask", "places.id,places.location,places.formattedAddress,places.displayName.text")
                    .POST(HttpRequest.BodyPublishers.ofString("""
                            {
                            "textQuery": "%s",
                            "languageCode": "ja"
                            }
                            """.formatted(query)))
                    .build(), HttpResponse.BodyHandlers.ofString());

            var resMap = gson.fromJson(res.body(), Map.class);
            var places = ((List<Map<?, ?>>) resMap.get("places"));
            if (places == null) {
                throw new RuntimeException(String.format("Places is null. query=\"%s\"", query));
            }
            if (places.size() != 1) {
                throw new RuntimeException(String.format("Invalid places length %d. query=\"%s\"", places.size(), query));
            }
            var place = places.get(0);
            var location = ((Map<String, Double>) place.get("location"));
            var splittedAddress = ((String) place.get("formattedAddress")).replace("日本、", "").split(" ", 2);
            return new Restaurant(
                    ((String) place.get("id")),
                    ((String) ((Map<?, ?>) place.get("displayName")).get("text")),
                    splittedAddress[0].replace("〒", ""),
                    splittedAddress[1],
                    location.get("latitude"),
                    location.get("longitude"),
                    null
            );
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException(e);
        }
    }

    public static class Restaurant {
        @CsvBindByName(column = "GOOGLE_PLACE_ID")
        public String placeId;
        @CsvBindByName(column = "NAME")
        public String name;
        @CsvBindByName(column = "POSTAL_CODE")
        public String postalCode;
        @CsvBindByName(column = "ADDRESS")
        public String address;
        @CsvBindByName(column = "LAT")
        public double lat;
        @CsvBindByName(column = "LNG")
        public double lng;
        @CsvBindByName(column = "ERROR")
        public String error;

        public Restaurant(String placeId, String name, String postalCode, String address, double lat, double lng, String error) {
            this.placeId = placeId;
            this.name = name;
            this.postalCode = postalCode;
            this.address = address;
            this.lat = lat;
            this.lng = lng;
            this.error = error;
        }
    }
}
