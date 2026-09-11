import hashlib
import json
import os
from pathlib import Path

from .errors import InvalidDocument, RevisionConflict


class VersionedJsonStore:
    collection_key = ''
    max_bytes = 2 * 1024 * 1024
    size_error = ''
    conflict_error = ''

    def __init__(self, path: Path):
        self.path = Path(path)

    def validate(self, document):
        raise NotImplementedError

    def read(self):
        if not self.path.exists():
            return {self.collection_key: {}, 'revision': None}
        raw = self.path.read_bytes()
        document = json.loads(raw.decode('utf-8-sig'))
        self.validate(document)
        return {
            self.collection_key: document,
            'revision': hashlib.sha256(raw).hexdigest(),
        }

    def save(self, document, expected_revision):
        try:
            self.validate(document)
            raw = json.dumps(
                document,
                ensure_ascii=False,
                indent=2,
                allow_nan=False,
            ).encode('utf-8')
        except (ValueError, TypeError) as error:
            raise InvalidDocument(str(error)) from error
        if len(raw) > self.max_bytes:
            raise InvalidDocument(self.size_error)
        if expected_revision != self.read()['revision']:
            raise RevisionConflict(self.conflict_error)

        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix('.json.tmp')
        with temporary.open('wb') as file:
            file.write(raw)
            file.flush()
            os.fsync(file.fileno())
        if self.path.exists():
            backup_temporary = self.path.with_suffix('.json.bak.tmp')
            backup_temporary.write_bytes(self.path.read_bytes())
            os.replace(backup_temporary, self.path.with_suffix('.json.bak'))
        os.replace(temporary, self.path)
        return self.read()
