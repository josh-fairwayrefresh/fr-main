#include "http_response.h"

#include <stdint.h>
#include <stdio.h>
#include <string.h>

static bool ascii_equal_ci(char left, char right)
{
	if (left >= 'A' && left <= 'Z') {
		left += 'a' - 'A';
	}
	if (right >= 'A' && right <= 'Z') {
		right += 'a' - 'A';
	}
	return left == right;
}

static bool header_name_is(const char *line, size_t name_len, const char *expected)
{
	size_t expected_len = strlen(expected);

	if (name_len != expected_len) {
		return false;
	}
	for (size_t index = 0; index < name_len; index++) {
		if (!ascii_equal_ci(line[index], expected[index])) {
			return false;
		}
	}
	return true;
}

static bool parse_content_length(const char *value, const char *line_end, size_t *result)
{
	while (value < line_end && (*value == ' ' || *value == '\t')) {
		value++;
	}
	if (value == line_end) {
		return false;
	}

	size_t parsed = 0;
	for (; value < line_end; value++) {
		if (*value < '0' || *value > '9') {
			return false;
		}
		if (parsed > (SIZE_MAX - (size_t)(*value - '0')) / 10U) {
			return false;
		}
		parsed = parsed * 10U + (size_t)(*value - '0');
	}
	*result = parsed;
	return true;
}

static bool parse_headers(struct fairway_http_response *response)
{
	char *header_end = strstr(response->data, "\r\n\r\n");

	if (header_end == NULL) {
		return true;
	}

	int status = 0;
	if (sscanf(response->data, "HTTP/%*u.%*u %d", &status) != 1 ||
	    status < 100 || status > 599) {
		return false;
	}

	bool found_content_length = false;
	const char *line = strstr(response->data, "\r\n");
	if (line == NULL) {
		return false;
	}
	line += 2;
	while (line < header_end) {
		const char *line_end = strstr(line, "\r\n");
		const char *colon;

		if (line_end == NULL || line_end > header_end) {
			return false;
		}
		colon = memchr(line, ':', (size_t)(line_end - line));
		if (colon == NULL) {
			return false;
		}
		if (header_name_is(line, (size_t)(colon - line), "Content-Length")) {
			if (found_content_length ||
			    !parse_content_length(colon + 1, line_end, &response->content_length)) {
				return false;
			}
			found_content_length = true;
		}
		line = line_end + 2;
	}

	response->body_offset = (size_t)(header_end + 4 - response->data);
	response->status_code = status;
	response->headers_complete = found_content_length;
	return found_content_length &&
	       response->content_length <= sizeof(response->data) - response->body_offset - 1U;
}

void fairway_http_response_init(struct fairway_http_response *response)
{
	memset(response, 0, sizeof(*response));
}

enum fairway_http_feed_result fairway_http_response_feed(
	struct fairway_http_response *response, const void *chunk, size_t chunk_len)
{
	if (response == NULL || (chunk == NULL && chunk_len > 0) ||
	    response->length + chunk_len >= sizeof(response->data)) {
		return FAIRWAY_HTTP_INVALID;
	}

	memcpy(response->data + response->length, chunk, chunk_len);
	response->length += chunk_len;
	response->data[response->length] = '\0';

	if (!response->headers_complete && !parse_headers(response)) {
		return FAIRWAY_HTTP_INVALID;
	}
	if (!response->headers_complete) {
		return FAIRWAY_HTTP_NEED_MORE;
	}

	size_t expected_length = response->body_offset + response->content_length;
	if (response->length > expected_length) {
		return FAIRWAY_HTTP_INVALID;
	}
	return response->length == expected_length ? FAIRWAY_HTTP_COMPLETE
						   : FAIRWAY_HTTP_NEED_MORE;
}

const char *fairway_http_response_body(const struct fairway_http_response *response)
{
	if (response == NULL || !response->headers_complete ||
	    response->length != response->body_offset + response->content_length) {
		return NULL;
	}
	return response->data + response->body_offset;
}