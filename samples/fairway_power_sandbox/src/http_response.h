#ifndef HTTP_RESPONSE_H
#define HTTP_RESPONSE_H

#include <stdbool.h>
#include <stddef.h>

#define FAIRWAY_HTTP_RESPONSE_MAX 4096

enum fairway_http_feed_result {
	FAIRWAY_HTTP_NEED_MORE = 0,
	FAIRWAY_HTTP_COMPLETE,
	FAIRWAY_HTTP_INVALID,
};

struct fairway_http_response {
	char data[FAIRWAY_HTTP_RESPONSE_MAX];
	size_t length;
	size_t body_offset;
	size_t content_length;
	int status_code;
	bool headers_complete;
};

void fairway_http_response_init(struct fairway_http_response *response);
enum fairway_http_feed_result fairway_http_response_feed(
	struct fairway_http_response *response, const void *chunk, size_t chunk_len);
const char *fairway_http_response_body(const struct fairway_http_response *response);

#endif /* HTTP_RESPONSE_H */