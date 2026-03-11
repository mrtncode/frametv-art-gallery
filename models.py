from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

# --- Models ---
class Album(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True, nullable=False)
    images = db.relationship('Image', backref='album', lazy=True, cascade="all, delete-orphan")

class Image(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    album_id = db.Column(db.Integer, db.ForeignKey('album.id'), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now())

class TV(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ip = db.Column(db.String(64), unique=True, nullable=False)
    name = db.Column(db.String(80), nullable=True)
    mac = db.Column(db.String(32), nullable=True)
    token = db.Column(db.Text, nullable=True)  # Store the TV token as text
    delete_other_images_on_upload = db.Column(db.Boolean, nullable=False, server_default=db.text("0"))

    uploaded_images = db.relationship(
        'UploadedImage',
        back_populates='tv',
        lazy=True,
        cascade='all, delete-orphan'
    )

class UploadedImage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    image_id = db.Column(db.Integer, db.ForeignKey('image.id'), nullable=False)
    # ensure database-level cascade as well
    tv_id = db.Column(db.Integer, db.ForeignKey('tv.id', ondelete='CASCADE'), nullable=False)
    content_id = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now())

    image = db.relationship('Image', backref='uploaded_images')
    tv = db.relationship('TV', back_populates='uploaded_images')

class ProviderConfig(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    provider = db.Column(db.String(32), nullable=False, unique=True)  # e.g. 'immich'
    host = db.Column(db.String(255), nullable=True)
    port = db.Column(db.Integer, nullable=True)
    api_key = db.Column(db.String(255), nullable=True)
    enabled = db.Column(db.Boolean, nullable=False, default=False)
    # Add more fields as needed for other providers

    def as_dict(self):
        return {
            'id': self.id,
            'provider': self.provider,
            'host': self.host,
            'port': self.port,
            'api_key': self.api_key,
            'enabled': self.enabled,
        }
