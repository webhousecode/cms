# Multi-stage Spring Boot Dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml ./
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /workspace/target/*.jar app.jar
COPY content ./content
COPY public ./public
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
