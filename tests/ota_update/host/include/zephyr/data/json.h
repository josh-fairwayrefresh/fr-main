#ifndef FAIRWAY_OTA_HOST_JSON_H
#define FAIRWAY_OTA_HOST_JSON_H

#include <stddef.h>
#include <stdint.h>

enum json_tokens { JSON_TOK_STRING, JSON_TOK_NUMBER, JSON_TOK_TRUE };
struct json_obj_descr {
	const char *field_name;
	size_t offset;
	enum json_tokens type;
};
#define JSON_OBJ_DESCR_PRIM(type_name, field, token) \
	{ #field, offsetof(type_name, field), token }
int64_t json_obj_parse(char *payload, size_t length,
		       const struct json_obj_descr *descriptors,
		       size_t descriptor_count, void *value);

#endif
