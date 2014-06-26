# -*- mode: ruby -*-
# vi: set ft=ruby :

Vagrant.configure("2") do |config|
  config.vm.box = "precise64"
  config.vm.box_url = "http://cloud-images.ubuntu.com/precise/current/precise-server-cloudimg-vagrant-amd64-disk1.box"

  # Port forwardings:
  # Elasticsearch
  config.vm.network :forwarded_port, guest: 9200, host: 9200

  # Frontend dev server
  config.vm.network :forwarded_port, guest: 5000, host: 5000

  config.vm.provision :shell, :inline => "apt-get -y update"
  config.vm.provision :shell, :inline => "apt-get -y upgrade"
  config.vm.provision :shell, :inline => "apt-get -y install git"
  config.vm.provision :shell, :inline => "apt-get -y install mysql-server"
  config.vm.provision :shell, :inline => "apt-get install libmysqlclient-dev"
  config.vm.provision :shell, :inline => "apt-get -y install python-setuptools"
  config.vm.provision :shell, :inline => "apt-get -y install python2.7-dev"
  config.vm.provision :shell, :inline => "easy_install pip"
  config.vm.provision :shell, :inline => "pip install virtualenv"
end
